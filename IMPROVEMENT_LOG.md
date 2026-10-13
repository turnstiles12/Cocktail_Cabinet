# Improvement Log

A running record of changes made to Cocktail Cabinet. Newest entries go at the bottom.
Each entry lists what changed, why, and which files were touched.

Status key: **Saved** = written to the project folder; **Not committed** = still needs `git commit` / push.

---

## 1. Wheel of Terror was missing from the deployed site
**Date:** 2026-10-12 · **Status:** Saved, not committed (merge `wheel` into `main` and push still to do)

**Problem:** The Wheel of Terror feature did not appear on the deployed site.

**Cause:**
- The game code only existed in the nested `site/` folder, but Netlify publishes the repository root (`publish = "."` in `netlify.toml`). The root `index.html` still listed seven games and did not load `wheel.js`.
- The feature was committed on the `wheel` branch, but deploys come from `main` and `wheel` had not been merged into it.

**Changes:**
- `js/games/wheel.js` — copied in from `site/js/games/wheel.js`.
- `index.html` — added `<script src="js/games/wheel.js" defer></script>` after `go.js`; "seven" changed to "eight" in the title, description, tagline and header comments.
- `js/main.js` — the wheel needs a side to be able to override the game layout (`role.layout`), and the menu title now says "eight games".
- `css/style.css` — added the `.chip[aria-pressed="true"]` rule used by the wheel's controls.
- `site/` left in place for now.

**Still to do (by hand):** commit, merge `wheel` into `main`, push `main`. Optionally remove `site/` afterwards (`git rm -r site`), first moving `site/tests/wheel_sim.js` and `site/tests/wheel_ui.py` into `tests/`.

---

## 2. Wheel of Terror: spikes could cut the ball off from the belt
**Date:** 2026-10-12 · **Status:** Saved, not committed

**Problem:** Sometimes a spike was placed so the ball could dodge it but could not get to the objects on the belt, so objects reached the middle.

**Cause:** The check for a new spike (`feasible`) only tested that the ball could avoid the spike, not that it could still reach the belt.

**Change:** `js/games/wheel.js` — added `BELT_KEEPOUT = 0.95` (radians either side of straight down). `addSpike` now rejects any spike inside that arc with "Too close to the belt". This applies to spikes the player plants and spikes the computer generates.

**Tested:** Spikes tried every 15° around the wheel. Those within 45° of straight down were rejected and 60° onward were accepted. The existing `wheel_sim.js` balance test still runs. Not tested in a browser, and balance was not compared with the old version.

**Note:** This covers the bottom-arc case. Other combinations of spikes cutting the ball off have not been checked.

---

## 3. Wheel of Terror: removed the pixel distance from the drop-zone text
**Date:** 2026-10-12 · **Status:** Saved, not committed

**Problem:** The sender's side panel said "click the belt (at least 100 px from the middle)".

**Change:** `js/games/wheel.js` — the text now reads "Pick an object, then click the belt to drop it."

**Note:** Only the displayed text changed. The rule itself is unchanged: objects still can't be dropped within 100 px of the center ("Too close to the middle"), and the hover preview still turns red there. The in-game help text still says "not too near the middle".

---

## 4. Snake: clearer board and stronger contrast (first pass)
**Date:** 2026-10-12 · **Status:** Superseded by entry 5

**Problem:** The grid was hard to see and the colors had low contrast.

**Change:** `js/games/snake.js` — dark-blue checkerboard board, brighter grid lines, a light-blue border, a lime snake and a brighter red apple.

---

## 5. Snake: light board that stands out from the page
**Date:** 2026-10-12 · **Status:** Saved, not committed

**Problem:** The board was still dark and blended into the dark page and frame around it.

**Change:** `js/games/snake.js` (`draw`):
- **Board:** off-white (`#f4f8ec`) and light green (`#c9e2b0`) checkerboard, dark-green grid lines, a thick yellow border.
- **Snake:** dark-blue head fading to purple, white segment outlines and white eyes.
- **Apple:** deep red (`#e0102a`) with a dark outline and a dark-green stem.
- **Apple-placement UI:** cursor, countdown ring, "Place an apple" text and particles changed to orange-red so they show on the light board.

**Tested:** Rendered in a test page and checked visually.

---

## 6. Breakout rebuilt: one paddle against marching bricks, with power-ups
**Date:** 2026-10-12 · **Status:** Saved, not committed

**Request:** Replace the two-paddle head-to-head game with one paddle destroying bricks that move toward the bottom. Bricks should have different strengths, there should be ball power-ups (ball tripler, paddle extender, speed increaser), and the computer should only add bricks, not control its own paddle.

**Changes:**
- `js/games/breakout.js` — rewritten.
  - **Bricks:** the computer adds a new row at the top (random gaps) whenever the last row has marched far enough down. Bricks have strength 1 to 4, shown as a number and a color. Stronger bricks become more common as the level rises (level goes up every 20 bricks destroyed), and the march gets faster. If you clear the board, new rows hurry in.
  - **Losing:** a red danger line sits above the paddle. Bricks that reach it are wiped and cost a life. A ball that falls past the paddle also costs a life. Three lives, then game over (best score is saved).
  - **Power-ups:** dropped by some broken bricks, caught with the paddle. **T** = ball tripler (every ball becomes three, up to 12 balls), **W** = paddle extender (1.6x wide for 15 s), **S** = speed increaser (balls 1.35x faster for 10 s). Active effects show at the bottom of the screen.
  - **Sides:** "You play the paddle · computer adds bricks", and "Watch the computer play" (a simple computer paddle that follows the lowest falling ball; restarts by itself). The old "top seat" side is gone because there is no second paddle.
- `tests/breakout_sim.js` — new headless test: bricks arrive and march down, strengths vary, a 3-strength brick takes exactly 3 hits, each power-up works and wears off, and games end and restart cleanly.
- `README.md` — Breakout rows updated for the new game.

**Tested:** `node tests/breakout_sim.js` passes all checks. A rendered frame was inspected (bricks, power-up capsule, wide paddle, three balls, danger line). Not yet played by hand in a browser, so difficulty (march speed, power-up drop rate of about 16 to 30 percent) is untuned.

**Note:** The old head-to-head version is still in `site/js/games/breakout.js` and in git history. The Playwright smoke tests were not re-run.

---

## 7. Splat: choose the bird's color and the pipes' color
**Date:** 2026-10-12 · **Status:** Saved, not committed

**Request:** Make the pipe color customizable and let the player pick the bird's color (yellow, orange, red, and so on).

**Changes:** `js/games/splat.js` only.
- A "Bird" row and a "Pipes" row of round color buttons appear under the side buttons on the Splat screen.
  - **Bird:** yellow, orange (the original look and the default), red, pink, purple, blue, green, white. Each color has its own wing shade, and the beak color is chosen to stand out against the body.
  - **Pipes:** green (the default), blue, red, orange, yellow, pink, purple, gray, each with a lighter cap.
- The choice applies immediately, in every side (including watch and "you build columns"), and is remembered in the browser for next time. The splat particles use the bird's color. The pickers are removed again when you leave the game.
- No changes to `main.js` or `style.css`; the pickers are added from `splat.js` with inline styles.

**Tested:** Loaded the real page in a browser, picked a red bird and purple pipes, played, saw the colors in the game, reloaded and found the choices remembered, and confirmed the pickers disappear on leaving. Not tested on a phone, and not tested with the other games loaded.

---

## 8. Asteroids: power-ups you collect by flying into them
**Date:** 2026-10-12 · **Status:** Saved, not committed

**Request:** Add power-ups the ship collects by direct contact with moving targets, such as faster fire or missiles.

**Changes:**
- `js/games/asteroids.js`:
  - **Tokens:** every 8 to 13 seconds a glowing lettered token appears and drifts across the (wrapping) screen. There are at most two at once, and each fades after 14 seconds (it blinks for the last 3). The ship has to touch one to pick it up. Bullets and rocks ignore them.
  - **R, rapid fire (10 s):** the gun cooldown drops from 0.17 s to 0.07 s and up to 10 bullets can be in flight (normally 5).
  - **M, missiles:** gives 4 homing missiles (carry up to 8). Press **X** or click to fire one. It curves toward the nearest rock and explodes on contact or after 3 s. The blast (70 px) breaks every rock close by, with normal splitting and points.
  - **S, shield (6 s):** the ship is unharmed, and touching a rock breaks it (it scores).
  - **3, triple shot (10 s):** three bullets in a fan.
  - Active power-ups and the missile count show at the bottom-left of the screen. Losing the ship loses them.
  - **Only the human pilot gets power-ups.** In "you send rocks" and "watch" the computer flies the plain ship, so the rules of those sides are unchanged.
  - The pilot help text and menu blurb mention the power-ups. Added a `state` test hook.
- `tests/asteroids_powerups.js` — new headless test (pickup only on contact, rapid fire, triple shot, homing missile breaks a rock, shield, tokens appear and cap at two, no power-ups for the computer-flown sides, effects lost on death). All pass.
- `README.md` — Asteroids row mentions the power-ups.

**Tested:** the headless test, plus a rendered frame showing the four tokens, a missile, a blast ring, the shield and the status line. Not played by hand in a browser, so spawn rate, durations and missile strength are untuned.

---

## 9. Missile Command: rebalanced, plus random wave conditions
**Date:** 2026-10-12 · **Status:** Saved, not committed

**Problem:** Too easy to win as the attacker and too easy to lose as the defender (the tanks/batteries).

**Measured first:** `tests/missile_sim.js` plays each side with a scripted stand-in for a human. Before the change the attacker stand-in flattened all six cities **79% to 92%** of the time, and the defender stand-in usually fell around wave 6 to 7.

**Changes in `js/games/missile.js`:**
- **Defense buffs** (the computer defense gets the same ones, as the game promises): 12 interceptors per battery (was 10), blast radius 42 (was 36), blasts linger 0.4 s (was 0.3 s), a free city rebuilt every 6,000 points (was 10,000).
- **Gentler computer attack:** warhead speed ramps `34 + 6.5 x wave` (was `40 + 8 x wave`), and wave size is `7 + 2.5 x wave` (was `8 + 3 x wave`).
- **Rebuild:** clearing a wave without losing a city rebuilds one (defend and watch sides; against a human attacker cities still stay destroyed).
- **Sharper computer defense against a human attacker:** starts at skill 0.18 and rises 0.13 per wave (was 0.10).
- **Wave conditions, new:** from wave 2, 85 percent of waves get one random condition, shown on the score plate and in the wave banner.
  - **Help the defense:** Calm skies (warheads 20% slower), Charged batteries (blasts 40% bigger), Supply drop (+5 interceptors per battery), Shield domes (each city absorbs one hit).
  - **Help the attack:** Meteor storm (warheads 25% faster), Armored warheads (about 40% need two separate blasts, drawn as orange squares), Radar jam (interceptors land up to 24 px off), MIRV rain (more warheads split, and the human attacker gets one extra split).
  - **Rubber banding:** the side that is losing is more likely to get a helpful condition (for example, a defender with 4 cities down gets a defense-helping condition about 80% of the time, against about 25% when no city has fallen).
- Help text for both sides mentions the conditions. Added a `state` test hook.

**After:** the attacker stand-in wins about **33% to 45%** and the defender stand-in's median wave rose from about 6 to 9 (sharp: 11). The stand-ins are simple (the attacker fires at random cities), so a smart human attacker will do better than these numbers.

**Tests:** `tests/missile_sim.js` (the balance numbers above) and `tests/missile_events.js` (13 checks: wave 1 has no condition, all 8 can occur, each one does what it says, rubber banding, clean-wave rebuild). Both run with `node`. Writing the tests caught two bugs in my first version (the condition picker flipped a separate coin per condition, and armor could be skipped on the same blast); both are fixed. Not played by hand in a browser.

---

<!-- Add new entries below. Format: number, title, date, status, problem, change, files, tested. -->
