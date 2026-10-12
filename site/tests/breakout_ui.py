"""
Breakout browser test.

Starts a local web server and opens Breakout in headless Chromium on each side.
 - paddle : serves, moves the mouse, and prints the score plates.
 - bricks : checks the shop panel exists, that placing a level-5 brick costs 5 credits and
            that pressing L (lower all bricks) costs 5 more.
 - watch  : lets the computer run both sides for 20 seconds and prints the score plates.
Saves screenshots to tests/shots/ and prints any page errors.

Run: CHROME=/path/to/chrome python3 tests/breakout_ui.py   (CHROME is optional)
"""
import os
LAUNCH = {'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {}
import asyncio, subprocess, time, re
HERE = os.path.dirname(os.path.abspath(__file__))
SRV = subprocess.Popen(['python3', '-m', 'http.server', '8766'], cwd=os.path.dirname(HERE), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
from playwright.async_api import async_playwright
URL = 'http://localhost:8766/'
os.makedirs(HERE + '/shots', exist_ok=True)

async def hud(pg):
    return await pg.evaluate("[hudL.textContent,hudC.textContent,hudR.textContent].join(' | ')")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**LAUNCH)
        pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        async def open_role(role):
            await pg.goto(URL); await pg.evaluate(f"localStorage.setItem('cc:role:breakout', JSON.stringify('{role}'))")
            await pg.goto(URL + '#breakout'); await pg.reload(); await pg.wait_for_timeout(500)
        # ---- paddle side
        await open_role('paddle')
        box = await pg.locator('#screen').bounding_box()
        await pg.mouse.move(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.9)
        await pg.keyboard.press('Space'); 
        for i in range(8):
            await pg.mouse.move(box['x'] + box['width'] * (0.3 + 0.05 * i), box['y'] + box['height'] * 0.9); await pg.wait_for_timeout(300)
        print('paddle :', await hud(pg)); await pg.screenshot(path=HERE + '/shots/breakout-paddle.png')
        # ---- brick-layer side
        await open_role('bricks')
        print('panel  :', (await pg.locator('#panel').inner_text()).replace('\n', ' / ')[:160])
        c0 = await hud(pg); print('start  :', c0)
        await pg.get_by_role('button', name=re.compile('Level 5 brick')).click()
        box = await pg.locator('#screen').bounding_box()
        await pg.mouse.click(box['x'] + box['width'] * (14 + 3 * 67 + 31) / 560, box['y'] + box['height'] * (40 + 2 * 24 + 9) / 720)
        await pg.wait_for_timeout(300); c1 = await hud(pg); print('placed :', c1)
        await pg.keyboard.press('l'); await pg.wait_for_timeout(300); c2 = await hud(pg); print('lowered:', c2)
        await pg.screenshot(path=HERE + '/shots/breakout-bricks.png')
        # ---- watch
        await open_role('watch'); await pg.wait_for_timeout(20000)
        print('watch  :', await hud(pg)); await pg.screenshot(path=HERE + '/shots/breakout-watch.png')
        print('page errors:', errs)
        await b.close()
try:
    asyncio.run(main())
finally:
    SRV.kill()
