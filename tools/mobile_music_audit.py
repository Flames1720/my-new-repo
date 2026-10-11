"""Exercise real soundtrack playback with Chromium mobile touch emulation."""
from playwright.sync_api import sync_playwright
import argparse
from pathlib import Path

def run(url):
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        for width,height in [(854,393),(915,412)]:
            ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
            page=ctx.new_page(); errors=[]
            page.add_init_script('window.audioGains=[];const createGain=AudioContext.prototype.createGain;AudioContext.prototype.createGain=function(){const gain=createGain.call(this);audioGains.push(gain);return gain}')
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(url,wait_until='domcontentloaded')
            page.wait_for_function('document.querySelector("#survivalLobby").classList.contains("show")',timeout=45000)
            page.locator('#enterGameDisplayMode').tap()
            def playing(name):
                page.wait_for_function('name => {const a=document.querySelector(`audio[data-soundtrack="${name}"]`);return a && !a.paused && a.currentTime>0 && a.readyState>=2}',arg=name)
                assert page.locator('audio').evaluate_all('(as)=>as.filter(a=>!a.paused).length')==1
            playing('chaos')
            for name in ['chaos','island-outbreak']:
                if name=='island-outbreak':page.locator('#startRunBtn').tap();playing(name)
                page.wait_for_function('name=>Number.isFinite(document.querySelector(`audio[data-soundtrack="${name}"]`).duration)',arg=name)
                page.locator(f'audio[data-soundtrack="{name}"]').evaluate('a=>a.currentTime=a.duration-.3')
                page.wait_for_function('name=>document.querySelector(`audio[data-soundtrack="${name}"]`).currentTime<5',arg=name)
                playing(name)
            page.locator('#survivalPauseBtn').tap();playing('island-outbreak')
            page.locator('#pauseSettingsBtn').tap();page.locator('[data-settings-tab="graphics"]').tap()
            slider=page.locator('#musicVolumeSlider');slider.scroll_into_view_if_needed()
            assert slider.is_visible()
            slider.evaluate('e=>{e.value="25";e.dispatchEvent(new Event("input",{bubbles:true}))}')
            assert page.evaluate('JSON.parse(localStorage.getItem("world-wildlife-settings-v1")).audioMusic')==.25
            page.wait_for_function('audioGains.some(g=>Math.abs(g.gain.value-.25)<.001)')
            page.evaluate('window.musicGains=audioGains.filter(g=>g.context===audioGains.find(g=>Math.abs(g.gain.value-.25)<.001).context)')
            assert abs(page.evaluate('musicGains[3].gain.value')-.25)<.001
            page.locator('#musicEnabledCheck').uncheck()
            page.wait_for_function('Array.from(document.querySelectorAll("audio")).every(a=>a.paused)')
            page.locator('#musicEnabledCheck').check();playing('island-outbreak')
            page.locator('#masterVolumeSlider').evaluate('e=>{e.value="0";e.dispatchEvent(new Event("input",{bubbles:true}))}')
            page.wait_for_function('musicGains[0].gain.value===0')
            assert page.evaluate('musicGains[1].gain.value')>0
            page.locator('#masterVolumeSlider').evaluate('e=>{e.value="70";e.dispatchEvent(new Event("input",{bubbles:true}))}')
            Path('/workspace/scratch/island-music').mkdir(exist_ok=True)
            page.screenshot(path=f'/workspace/scratch/island-music/graphics-{width}.png')
            page.locator('#settingsClose').tap()
            page.locator('#resumeRunBtn').tap();playing('island-outbreak')
            page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))')
            assert page.locator('audio').evaluate_all('(as)=>as.every(a=>a.paused)')
            page.evaluate('delete document.hidden;document.dispatchEvent(new Event("visibilitychange"))')
            playing('island-outbreak')
            page.locator('#leaveSurvivalBtn').tap();playing('chaos')
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function('document.querySelector("#survivalLobby").classList.contains("show")',timeout=45000)
            if page.locator('#displayModeGate').is_visible():page.locator('#enterGameDisplayMode').tap()
            else:page.locator('#lobbyOptionsBtn').tap()
            playing('chaos')
            assert page.evaluate('JSON.parse(localStorage.getItem("world-wildlife-settings-v1")).audioMusic')==.25
            if not page.locator('#settingsOverlay').is_visible():page.locator('#lobbyOptionsBtn').tap()
            page.locator('[data-settings-tab="graphics"]').tap()
            page.locator('#musicEnabledCheck').uncheck()
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function('document.querySelector("#survivalLobby").classList.contains("show")',timeout=45000)
            if page.locator('#displayModeGate').is_visible():page.locator('#enterGameDisplayMode').tap()
            else:page.locator('#lobbyOptionsBtn').tap()
            assert page.evaluate('JSON.parse(localStorage.getItem("world-wildlife-settings-v1")).audioMusicEnabled') is False
            page.wait_for_timeout(300)
            assert page.locator('audio').evaluate_all('(as)=>as.length===2 && as.every(a=>a.paused)')
            assert not errors,errors
            print(f'{width}x{height}: both tracks play and loop, exclusive switching, gameplay track retained during pause, independent music off/master mute, background suspension, controls accessible, preferences persisted; no page errors',flush=True)
            ctx.close()
        browser.close()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:4173');run(parser.parse_args().url)
