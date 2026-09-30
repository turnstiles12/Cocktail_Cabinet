import os
LAUNCH = {'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {}
import asyncio, subprocess, time
SRV=subprocess.Popen(['python3','-m','http.server','8765'],cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
from playwright.async_api import async_playwright
URL='http://localhost:8765/'
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(**LAUNCH)
    ctx = await b.new_context(); errs=[]
    pages=[]
    for g in ['snake','breakout','splat','asteroids','missile','go']:
      pg = await ctx.new_page(); pg.on('pageerror', lambda e,g=g: errs.append(g+': '+str(e)))
      await pg.goto(URL); await pg.evaluate(f"localStorage.setItem('cc:role:{g}', JSON.stringify('watch'))"); await pg.goto(URL+'#'+g); await pg.reload()
      pages.append((g,pg))
    solo = await ctx.new_page(); solo.on('pageerror', lambda e: errs.append('imit: '+str(e)))
    await solo.goto(URL+'#imitation'); await solo.wait_for_timeout(300)
    await solo.get_by_role('button', name='Find a match').click()
    for t in range(6):
      await asyncio.sleep(10)
      row=[]
      for g,pg in pages:
        row.append(g+'='+await pg.evaluate("hudL.textContent+' / '+hudC.textContent+' / '+hudR.textContent"))
      print(t, ' ;; '.join(row))
    print('imitation solo chat started:', await solo.locator('.chat-input').count(), await solo.eval_on_selector_all('.msg','els=>els.map(e=>e.textContent)'))
    print('ERR', errs)
    await b.close()
try: asyncio.run(main())
finally: SRV.kill()
