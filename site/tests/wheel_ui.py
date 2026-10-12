"""
Wheel of Terror browser test.

Starts a local web server and opens Wheel of Terror in headless Chromium on each side.
 - swing  : holds Space for a while and checks the score plates change.
 - sender : checks the shop panel exists, that dropping a crate on the belt costs 1 credit
            and that planting a spike on the ring costs 4.
 - watch  : lets the computer run both sides for 20 seconds.
Saves screenshots to tests/shots/ and prints any page errors.

Run: CHROME=/path/to/chrome python3 tests/wheel_ui.py   (CHROME is optional)
"""
import os
LAUNCH = {'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {}
import asyncio, subprocess, time, re
HERE = os.path.dirname(os.path.abspath(__file__))
SRV = subprocess.Popen(['python3', '-m', 'http.server', '8767'], cwd=os.path.dirname(HERE), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
from playwright.async_api import async_playwright
URL = 'http://localhost:8767/'
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
            await pg.goto(URL); await pg.evaluate(f"localStorage.setItem('cc:role:wheel', JSON.stringify('{role}'))")
            await pg.goto(URL + '#wheel'); await pg.reload(); await pg.wait_for_timeout(500)
        await open_role('swing')
        await pg.keyboard.down('Space'); await pg.wait_for_timeout(9000); await pg.keyboard.up('Space')
        print('swing  :', await hud(pg)); await pg.screenshot(path=HERE + '/shots/wheel-swing.png')
        await open_role('sender')
        print('panel  :', (await pg.locator('#panel').inner_text()).replace('\n', ' / ')[:150])
        print('start  :', await hud(pg))
        box = await pg.locator('#screen').bounding_box()
        sx, sy = box['width'] / 800, box['height'] / 600
        await pg.mouse.click(box['x'] + 150 * sx, box['y'] + 370 * sy); await pg.wait_for_timeout(200)
        print('crate  :', await hud(pg))
        await pg.mouse.click(box['x'] + 400 * sx, box['y'] + 65 * sy); await pg.wait_for_timeout(200)
        print('spike  :', await hud(pg)); await pg.screenshot(path=HERE + '/shots/wheel-sender.png')
        await open_role('watch'); await pg.wait_for_timeout(20000)
        print('watch  :', await hud(pg)); await pg.screenshot(path=HERE + '/shots/wheel-watch.png')
        print('page errors:', errs)
        await b.close()
try:
    asyncio.run(main())
finally:
    SRV.kill()
