"""Browser smoke test.

Starts a local web server, opens every game on every side in headless Chromium, clicks
and presses keys, waits, then prints each game's score plates and banner and any page
errors. Saves screenshots to tests/shots/.

Run: CHROME=/path/to/chrome python3 tests/smoke.py   (CHROME is optional)
"""
import os
LAUNCH = {'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {}
import asyncio, subprocess, time
SRV=subprocess.Popen(['python3','-m','http.server','8765'],cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
from playwright.async_api import async_playwright
URL='http://localhost:8765/'
GAMES={'snake':['steer','apples','watch'],'breakout':['bottom','top','watch'],'splat':['flap','columns','watch'],'asteroids':['pilot','sender','watch'],'missile':['defend','attack','watch'],'go':['black','white','watch','online'],'imitation':['human','ai']}
os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)),'shots'), exist_ok=True)
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(**LAUNCH, args=['--autoplay-policy=no-user-gesture-required'])
    pg = await b.new_page(viewport={'width':1280,'height':900})
    errs=[]
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.on('console', lambda m: errs.append(('console', m.text)) if m.type=='error' else None)
    await pg.goto(URL); await pg.wait_for_timeout(800)
    await pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)),'shots')+'/menu.png', full_page=True)
    for g, roles in GAMES.items():
      for r in roles:
        await pg.evaluate(f"localStorage.setItem('cc:role:{g}', JSON.stringify('{r}'))")
        await pg.goto(URL+'#'+g); await pg.reload(); await pg.wait_for_timeout(300)
        box = await pg.locator('#screen').bounding_box()
        # generic poke: some clicks, keys
        for i in range(6):
          if box and g!='imitation':
            await pg.mouse.click(box['x']+box['width']*(0.2+0.12*i), box['y']+box['height']*(0.3+0.08*i))
          await pg.keyboard.press('Space'); await pg.keyboard.press('ArrowLeft')
          await pg.wait_for_timeout(250)
        await pg.wait_for_timeout(6000 if r=='watch' else 2500)
        hud = await pg.evaluate("[hudL.textContent,hudC.textContent,hudR.textContent].join(' | ')")
        ban = await pg.evaluate("banner.hidden ? '' : bannerTitle.textContent+' / '+bannerSub.textContent")
        print(f'{g:10} {r:8} HUD: {hud} || banner: {ban}')
        await pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)),'shots')+f'/{g}-{r}.png')
    print('ERRORS:', errs[:20])
    await b.close()
try:
  asyncio.run(main())
finally:
  SRV.kill()
