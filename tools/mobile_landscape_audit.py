#!/usr/bin/env python3
"""Touch/landscape regression on the production build (no fullscreen mocks).
Requires Python Playwright + `python -m playwright install chromium`.
Run: npm run build; npm run preview -- --host 0.0.0.0 --port 4173
Then: python tools/mobile_landscape_audit.py --out /workspace/scratch/island-verified
Screenshots/report stay outside the repository by default.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

SIZES = ((854, 393), (915, 412))
LOBBY = ('mission', 'kit', 'wildcards', 'records', 'challenges', 'upgrades')
SETTINGS = ('controls', 'graphics', 'player', 'diagnostics')
BOUNDS = '''e => {const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,scrollH:e.scrollHeight,clientH:e.clientHeight,scrollW:e.scrollWidth,clientW:e.clientWidth}}'''


def run(url, out):
    out.mkdir(parents=True, exist_ok=True)
    report = {'url': url, 'emulation': 'Chromium mobile + touch, DPR 1; native fullscreen', 'screens': [], 'checks': [], 'errors': []}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for width, height in SIZES:
            name = f'{width}x{height}'
            ctx = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True, device_scale_factor=1, reduced_motion='reduce', permissions=['clipboard-read', 'clipboard-write'])
            page = ctx.new_page()
            page.on('pageerror', lambda error: report['errors'].append(str(error)))
            page.set_default_timeout(10000)
            cdp = ctx.new_cdp_session(page)
            def check(label, condition, details=None):
                print(name, label, 'PASS' if condition else 'FAIL', flush=True)
                report['checks'].append({'viewport': name, 'check': label, 'passed': bool(condition), 'details': details})
                if not condition:
                    report['errors'].append(f'{name}: {label}: {details}')
            def screenshot(label):
                path = out / f'{name}-{label}.png'
                page.screenshot(path=str(path), animations='disabled')
                report['screens'].append({'viewport': name, 'page': label, 'image': str(path)})
            def box(selector):
                return page.locator(selector).evaluate(BOUNDS)
            def point(selector):
                r = box(selector)
                return (r['x'] + r['w']/2, r['y'] + r['h']/2)
            def touch(kind, points):
                cdp.send('Input.dispatchTouchEvent', {'type':kind, 'touchPoints':[{'id': i, 'x': x, 'y': y} for i,x,y in points]})
            def swipe(x, y, dx, dy, duration=300):
                touch('touchStart', [(1,x,y)])
                for i in range(1,7):
                    touch('touchMove', [(1,x+dx*i/6,y+dy*i/6)])
                    page.wait_for_timeout(duration/6)
                touch('touchEnd', [])
            def tap(selector):
                page.locator(selector).tap()
                page.wait_for_timeout(80)
            try:
                page.goto(url, wait_until='domcontentloaded', timeout=45000)
                page.wait_for_function('document.querySelector("#survivalLobby").classList.contains("show")', timeout=45000)
                page.locator('#enterGameDisplayMode').wait_for(state='visible', timeout=45000)
                screenshot('fullscreen-gate')
                tap('#enterGameDisplayMode')
                page.wait_for_function("document.body.classList.contains('display-mode-ready')")
                check('native fullscreen and exact mobile viewport', page.evaluate('!!document.fullscreenElement && innerWidth === %s && innerHeight === %s && matchMedia("(pointer:coarse)").matches && navigator.maxTouchPoints > 0' % (width,height)))
                for section in LOBBY:
                    tap(f'[data-lobby-page="{section}"]')
                    active = page.locator(f'[data-lobby-panel="{section}"]')
                    check(f'{section}: exactly one lobby panel', page.locator('[data-lobby-panel]:visible').count()==1)
                    screenshot(section)
                    r = box('.lobbyStage')
                    info = {'stage': r, 'panel': active.evaluate(BOUNDS)}
                    check(f'{section}: no horizontal overflow', r['scrollW'] <= r['clientW']+1, info)
                    check(f'{section}: contents fit stage', r['scrollH'] <= r['clientH']+1, info)
                    check(f'{section}: deploy target remains visible', box('#startRunBtn')['y']+box('#startRunBtn')['h']<=height and box('#startRunBtn')['h']>=44)
                    if section=='wildcards':
                        cards = page.locator('.wildcardCard')
                        rs = cards.evaluate_all('es=>es.map(e=>({x:e.offsetLeft,y:e.offsetTop,w:e.offsetWidth,h:e.offsetHeight}))')
                        check('all ten wildcards in two rows', cards.count()==10 and len(set(r['y'] for r in rs))==2, rs)
                        for index in (0,1):
                            card = cards.nth(index)
                            was = card.get_attribute('aria-pressed')
                            card.tap(); screenshot(f'wildcard-{index+1}-back')
                            back=card.locator('.wildcardBack')
                            check('wildcard back fits',back.evaluate('e=>e.scrollHeight<=e.clientHeight+1'))
                            card.tap(); check('wildcard equip/remove tap', cards.nth(index).get_attribute('aria-pressed') != was)
                            cards.nth(index).tap(); cards.nth(index).tap()
                    if section=='kit':
                        tap('[data-lobby-weapon="shotgun"]')
                        check('weapon selection', page.locator('#lobbyWeaponSelect').input_value()=='shotgun')
                tap('#lobbyOptionsBtn')
                for section in SETTINGS:
                    tap(f'[data-settings-tab="{section}"]')
                    check(f'{section}: exactly one settings page',page.locator('.settingsPage:visible').count()==1 and page.locator(f'.settingsPage[data-settings-page="{section}"]').is_visible())
                    screenshot(f'settings-{section}')
                    check(f'{section}: settings fills available width',box(f'.settingsPage[data-settings-page="{section}"]')['w']>width*.8)
                    check(f'{section}: no horizontal settings overflow',box('.settingsBody')['scrollW']<=box('.settingsBody')['clientW']+1)
                    r=box('.settingsBody')
                    if r['scrollH']>r['clientH']+1:
                        swipe(r['x']+r['w']*.72,r['y']+r['h']*.85,0,-r['h']*.65)
                        check(f'{section}: touch scrolling works',page.locator('.settingsBody').evaluate('e=>e.scrollTop')>0)
                        screenshot(f'settings-{section}-scrolled')
                    if section=='controls':
                        tap('#invertYCheck'); check('control checkbox',page.locator('#invertYCheck').is_checked()); tap('#invertYCheck')
                        tap('#hudCustomizeBtn'); screenshot('hud-editor')
                        tap('#hudEditorMinimize'); check('editor collapse',page.locator('#hudEditorPanel').evaluate("e=>e.classList.contains('collapsed')"))
                        tap('#hudEditorMinimize')
                        page.locator('#hudSaveBtn').scroll_into_view_if_needed(); tap('#hudSaveBtn')
                        check('editor save and close',not page.locator('#hudEditorOverlay').is_visible())
                        tap('#lobbyOptionsBtn')
                    if section=='graphics':
                        # Tap range tracks through the touchscreen rather than assigning DOM values.
                        for selector in ('#masterVolumeSlider','#sfxVolumeSlider'):
                            page.locator(selector).scroll_into_view_if_needed(); r=box(selector)
                            page.touchscreen.tap(r['x']+r['w']*.55,r['y']+r['h']/2)
                        audio = page.evaluate("JSON.parse(localStorage.getItem('world-wildlife-settings-v1'))")
                        check('audio preferences saved',0.3<audio['audioMaster']<0.8 and 0.3<audio['audioSfx']<0.8,audio)
                    if section=='player':
                        page.locator('#playerNameInput').fill('Landscape Tester')
                        check('name field usable',page.locator('#playerNameInput').input_value()=='Landscape Tester' and box('#playerNameInput')['w']>width*.4)
                    if section=='diagnostics':
                        capturing=page.evaluate('window.__islandOutbreakPerfEnabled === true')
                        check('capture label matches state',page.locator('#diagnosticCaptureBtn').inner_text()==('STOP CAPTURE' if capturing else 'START CAPTURE'))
                        tap('#diagnosticCaptureBtn'); check('capture toggle',page.evaluate('window.__islandOutbreakPerfEnabled === true') != capturing)
                        tap('#diagnosticCopyBtn'); tap('#diagnosticClearBtn')
                        check('clear results',page.locator('#diagnosticReadout').inner_text()=='Results cleared.')
                        tap('#diagnosticsCopy')
                        check('copy background logs', 'Copied' in page.locator('#diagnosticsStatus').inner_text())
                        tap('#diagnosticsClear'); check('clear background logs','Logs cleared' in page.locator('#diagnosticsStatus').inner_text())
                tap('#settingsClose'); tap('[data-lobby-page="kit"]'); tap('[data-lobby-weapon="shotgun"]'); tap('#startRunBtn')
                page.wait_for_timeout(900)
                screenshot('gameplay')
                check('deploy selected weapon', '870' in page.locator('#survivalWeapon').inner_text())
                # Every visible combat control must be reachable at its center, with no competing control on top.
                controls=page.locator('#touch [data-hud-id]:visible')
                for control in controls.all():
                    check(f'{control.get_attribute("id")}: touch target reachable',control.evaluate('e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e.contains(h)&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.width>=34&&r.height>=34}'))
                check('ADS clear of minimap',page.evaluate('()=>{const a=document.querySelector("#aimBtn").getBoundingClientRect(),b=document.querySelector("#minimapContainer").getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom}'))
                reticle=box('#target');check('reticle centered',abs(reticle['x']+reticle['w']/2-width/2)<1 and abs(reticle['y']+reticle['h']/2-height/2)<1,reticle)
                # Actual CDP touches test independent movement/look/ADS/fire ownership.
                ax,ay=point('#aimBtn'); sx,sy=point('#shootBtn')
                heading=page.locator('#compass').inner_text()
                touch('touchStart',[(1,ax,ay)]); page.wait_for_timeout(120)
                check('ADS activates on touch down',page.evaluate("document.body.classList.contains('aim-active')"))
                touch('touchMove',[(1,ax-40,ay+20)]);page.wait_for_timeout(150)
                check('ADS drag does not rotate camera',page.locator('#compass').inner_text()==heading)
                screenshot('aiming');touch('touchEnd',[])
                ammo=int(page.locator('#survivalAmmo').inner_text())
                touch('touchStart',[(1,sx,sy)]);page.wait_for_timeout(500)
                touch('touchMove',[(1,sx+40,sy+20)]);page.wait_for_timeout(150);touch('touchEnd',[])
                check('shoot consumes ammo',int(page.locator('#survivalAmmo').inner_text())<ammo)
                check('shoot drag does not rotate camera',page.locator('#compass').inner_text()==heading)
                tap('#reloadBtn');page.wait_for_function('Number(document.querySelector("#survivalAmmo").textContent) === '+str(ammo),timeout=30000)
                check('reload restores magazine',int(page.locator('#survivalAmmo').inner_text())==ammo)
                tap('#weaponSwitchBtn');check('weapon swap responds','870' not in page.locator('#survivalWeapon').inner_text())
                heading=page.locator('#compass').inner_text()
                swipe(width*.65,height*.5,70,0)
                check('look-zone touch rotates view',page.locator('#compass').inner_text()!=heading)
                # Claw: move, look and ADS remain active together with separate pointers.
                touch('touchStart',[(1,150,height*.60),(2,width*.64,height*.50),(3,ax,ay)])
                touch('touchMove',[(1,150,height*.60-45),(2,width*.64+45,height*.50),(3,ax,ay)])
                page.wait_for_timeout(700)
                check('simultaneous move and ADS',page.locator('#stick').evaluate("e=>e.classList.contains('active')") and page.evaluate("document.body.classList.contains('aim-active')"))
                screenshot('movement');touch('touchEnd',[])
                check('movement released',page.locator('#stick').evaluate("e=>!e.classList.contains('active')"))
                tap('#jumpBtn');tap('#slideBtn')
                tap('#survivalPauseBtn'); screenshot('pause')
                check('pause shown',page.locator('#survivalPauseOverlay').is_visible())
                for selector in ('#resumeRunBtn','#pauseSettingsBtn','#restartPausedRunBtn','#leaveSurvivalBtn'):
                    r=box(selector);check(f'{selector}: pause button fits',r['h']>=44 and r['y']+r['h']<=height)
                wave=page.locator('#survivalWave').inner_text();page.wait_for_timeout(700)
                check('paused simulation stays frozen',page.locator('#survivalWave').inner_text()==wave)
                tap('#pauseSettingsBtn'); tap('[data-settings-tab="graphics"]');screenshot('pause-settings');tap('#settingsClose')
                check('settings close returns to paused run',page.locator('#survivalPauseOverlay').is_visible())
                tap('#restartPausedRunBtn'); check('restart responds',not page.locator('#survivalPauseOverlay').is_visible())
                tap('#survivalPauseBtn');tap('#resumeRunBtn')
                cdp.send('Emulation.setDeviceMetricsOverride',{'width':height,'height':width,'deviceScaleFactor':1,'mobile':True,'screenOrientation':{'type':'portraitPrimary','angle':0}});page.wait_for_timeout(200)
                check('portrait reopens gate',page.locator('#displayModeGate').is_visible())
                cdp.send('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':1,'mobile':True,'screenOrientation':{'type':'landscapePrimary','angle':90}});page.wait_for_timeout(200)
                check('rotation restoration remains paused',page.locator('#survivalPauseOverlay').is_visible())
                tap('#resumeRunBtn');page.evaluate('document.exitFullscreen()')
                page.locator('#displayModeGate').wait_for(state='visible')
                check('fullscreen exit reopens gate',page.locator('#displayModeGate').is_visible())
                tap('#enterGameDisplayMode')
                page.wait_for_function('!!document.fullscreenElement && document.body.classList.contains("display-mode-ready")')
                page.locator('#survivalPauseOverlay').wait_for(state='visible')
                check('fullscreen restoration remains paused',page.locator('#survivalPauseOverlay').is_visible())
                tap('#leaveSurvivalBtn');check('quit returns to lobby',page.locator('#survivalLobby').is_visible())
                page.reload(wait_until='domcontentloaded')
                page.wait_for_function('document.querySelector("#survivalLobby").classList.contains("show")', timeout=45000)
                if page.locator('#displayModeGate').is_visible():tap('#enterGameDisplayMode')
                tap('#lobbyOptionsBtn');tap('[data-settings-tab="graphics"]')
                saved=page.evaluate("JSON.parse(localStorage.getItem('world-wildlife-settings-v1'))")
                check('audio survives reload',saved['audioMaster']==audio['audioMaster'] and saved['audioSfx']==audio['audioSfx'])
                check('wildcard loadout survives reload',page.evaluate("JSON.parse(localStorage.getItem('island-outbreak-meta-v1')).equippedWildcards.length===2"))
            except Exception as exc:
                report['errors'].append(f'{name}: {exc}')
                screenshot('failure')
            finally:
                ctx.close()
                (out/'report.json').write_text(json.dumps(report,indent=2))
        browser.close()
    print(json.dumps({'screenshots':len(report['screens']),'checks':len(report['checks']),'errors':report['errors']},indent=2))
    if report['errors']:raise SystemExit(1)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:4173');parser.add_argument('--out',type=Path,default=Path('/workspace/scratch/island-verified'))
    args=parser.parse_args();run(args.url,args.out)
