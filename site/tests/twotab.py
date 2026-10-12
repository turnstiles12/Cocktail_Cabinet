"""Two-tab test.

Opens two tabs in one browser and checks that (1) Imitation quick match pairs them, they
exchange chat lines, both vote and both see the reveal, and (2) a Go room can be opened
and joined, with a move on one tab appearing on the other. Uses the same-browser channel,
not the internet path.

Run: CHROME=/path/to/chrome python3 tests/twotab.py   (CHROME is optional)
"""
import os
LAUNCH = {'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {}
import asyncio, subprocess, time
SRV=subprocess.Popen(['python3','-m','http.server','8765'],cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
from playwright.async_api import async_playwright
URL='http://localhost:8765/'
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(**LAUNCH)
    ctx = await b.new_context()
    errs=[]
    A = await ctx.new_page(); B = await ctx.new_page()
    for pg,n in ((A,'A'),(B,'B')): pg.on('pageerror', lambda e,n=n: errs.append(n+str(e)))
    # ---- Imitation quick match
    for pg in (A,B): await pg.goto(URL+'#imitation'); await pg.wait_for_timeout(400)
    await A.get_by_role('button', name='Find a match').click(); await B.get_by_role('button', name='Find a match').click()
    for i in range(30):
      await A.wait_for_timeout(1000)
      if await A.locator('.chat-input').count() and await B.locator('.chat-input').count(): break
    print('matched after ~',i,'s')
    await A.fill('.chat-input input','hello from A'); await A.keyboard.press('Enter')
    await B.wait_for_timeout(800)
    await B.fill('.chat-input input','hi A, B here'); await B.keyboard.press('Enter')
    await A.wait_for_timeout(800)
    la = await A.eval_on_selector_all('.msg', 'els=>els.map(e=>e.textContent)'); lb = await B.eval_on_selector_all('.msg','els=>els.map(e=>e.textContent)')
    print('A sees', la); print('B sees', lb)
    # force the round to end: shift the deadline via Date override
    for pg in (A,B): await pg.evaluate("(()=>{const r=Date.now; const off=125000; Date.now=()=>r()+off;})()")
    await A.wait_for_timeout(1500)
    await A.get_by_role('button', name='A person').click(); await B.get_by_role('button', name='The machine').click()
    await A.wait_for_timeout(2500)
    print('A reveal:', (await A.locator('.stack h4').last.text_content()), '|', await A.eval_on_selector_all('.stack p.status','els=>els.map(e=>e.textContent)'))
    print('B reveal:', (await B.locator('.stack h4').last.text_content()), '|', await B.eval_on_selector_all('.stack p.status','els=>els.map(e=>e.textContent)'))
    # ---- Go room
    for pg in (A,B):
      await pg.evaluate("localStorage.setItem('cc:role:go', JSON.stringify('online'))"); await pg.goto(URL+'#go'); await pg.reload(); await pg.wait_for_timeout(400)
    await A.get_by_role('button', name='Open a room').click(); await A.wait_for_timeout(300)
    msg = await A.locator('#panel p.status.dim').text_content(); code = msg.split()[1]
    print('room', code)
    await B.fill('#panel input.field', code); await B.get_by_role('button', name='Join room').click()
    await A.wait_for_timeout(3000)
    sa = await A.locator('#panel p.status').first.text_content(); sb = await B.locator('#panel p.status').first.text_content()
    print('A:', sa, '| B:', sb)
    first = A if 'Your move' in sa else B; second = B if first is A else A
    box = await first.locator('#screen').bounding_box()
    await first.mouse.click(box['x']+box['width']*0.5, box['y']+box['height']*0.5); await first.wait_for_timeout(800)
    print('after move: first:', await first.locator('#panel p.status').first.text_content(), '| second:', await second.locator('#panel p.status').first.text_content(), await second.evaluate("hudC.textContent"))
    print('ERR', errs)
    await b.close()
try:
  asyncio.run(main())
finally:
  SRV.kill()
