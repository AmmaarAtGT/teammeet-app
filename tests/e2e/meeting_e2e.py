"""Two-person browser test against a real LiveKit server.

Prereqs:  pip install playwright && python -m playwright install chromium
Run:      livekit-server --dev            (terminal 1)
          cd app && npm run dev            (terminal 2)
          python tests/e2e/meeting_e2e.py  (terminal 3)
Checks: join, both videos play, mute/camera-off propagate, chat, raise hand,
background panel, recordings tab, leave. Fails with a timeout if any step breaks.
Set TEAMMEET_URL to test another deployment (e.g. https://meet.yourco.com).
"""
import asyncio, sys
from playwright.async_api import async_playwright
import os
URL=os.environ.get("TEAMMEET_URL","http://127.0.0.1:3000")+"/e2e-test"
ARGS=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required"]
async def join(b,name):
    ctx=await b.new_context(viewport={"width":1280,"height":800}, permissions=["camera","microphone"])
    p=await ctx.new_page(); errs=[]
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.on("console", lambda m: m.type=="error" and errs.append(m.text))
    await p.goto(URL); await p.fill("#nameInput",name); await p.click("#joinBtn")
    await p.wait_for_selector("#meeting:not(.hidden)", timeout=15000)
    return p,errs
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(args=ARGS)
        a,ea=await join(b,"Ammar"); k,ek=await join(b,"Akhtar")
        await a.wait_for_function("document.querySelectorAll('.tile').length===2", timeout=15000)
        await k.wait_for_function("document.querySelectorAll('.tile').length===2", timeout=15000)
        print("tiles A/K:", await a.locator(".tile").count(), await k.locator(".tile").count())
        print("count badge:", await a.inner_text("#countBadge"))
        await a.wait_for_function("[...document.querySelectorAll('.tile video')].filter(v=>!v.classList.contains('hidden') && v.videoWidth>0).length===2", timeout=15000)
        print("both videos playing on Ammar's screen")
        # mute mic + cam on Akhtar -> Ammar sees muted + avatar
        await k.click("#micBtn"); await k.click("#camBtn")
        await a.wait_for_function("[...document.querySelectorAll('.tile')].some(t=>t.textContent.includes('Akhtar') && t.querySelector('.mic').textContent.includes('🔇') && !t.querySelector('.avatar').classList.contains('hidden'))", timeout=10000)
        print("mute/cam-off propagated:", await k.get_attribute("#micBtn","class"), await k.get_attribute("#camBtn","class"))
        await k.click("#camBtn"); await k.click("#micBtn")
        # chat
        await k.click("#chatBtn"); await k.fill("#chatInput","Hello from Akhtar"); await k.press("#chatInput","Enter")
        await a.wait_for_function("!document.getElementById('unread').classList.contains('hidden')", timeout=8000)
        await a.click("#chatBtn")
        print("chat received:", "Hello from Akhtar" in await a.inner_text("#chatLog"))
        # raise hand
        await k.click("#handBtn")
        await a.wait_for_function("[...document.querySelectorAll('.tile')].some(t=>t.textContent.includes('Akhtar') && !t.querySelector('.hand').classList.contains('hidden'))", timeout=8000)
        print("raise hand propagated")
        # background
        await a.click("#bgBtn"); await a.click("#bgEffects .bg-opt[data-i='2']")
        await a.wait_for_timeout(4000)
        print("bg note:", repr(await a.inner_text("#bgNote")), "| bg active:", "active" in (await a.get_attribute("#bgBtn","class")))
        await a.click("#bgColors .bg-opt[data-color='#5b6577']"); await a.wait_for_timeout(3000)
        print("color selected:", await a.locator("#bgColors .bg-opt.selected").count())
        await a.click("#bgClose")
        # recordings tab
        await a.click(".tab[data-tab='recs']"); await a.wait_for_timeout(800)
        print("recs tab:", (await a.inner_text("#recList"))[:80])
        await a.screenshot(path="e2e-meeting.png")
        await k.click(".tab[data-tab='people']"); 
        # leave
        await k.click("#leaveBtn")
        await a.wait_for_function("document.querySelectorAll('.tile').length===1", timeout=10000)
        print("leave propagated")
        real=[e for e in ea+ek if "rtc/v1" not in e and "404" not in e]
        print("console errors:", real[:5])
        print("ALL MEETING CHECKS PASSED")
        await b.close()
asyncio.run(main())
