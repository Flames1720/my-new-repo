#!/usr/bin/env python3
"""Production mobile regression: saved graphics, touch streaming, HUD and PNG export.
Requires Python Playwright/Chromium and Pillow. Cloud FPS is not a phone benchmark.
"""
import argparse
import json
import math
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright


def run(url, out):
    out.mkdir(parents=True, exist_ok=True)
    report = {'viewport': '800x360', 'dpr': 2, 'checks': [], 'errors': []}
    def check(label, condition, detail=None):
        report['checks'].append({'check': label, 'passed': bool(condition), 'detail': detail})
        print(label, 'PASS' if condition else 'FAIL', flush=True)
        if not condition:
            report['errors'].append(label)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = browser.new_context(viewport={'width': 800, 'height': 360}, is_mobile=True, has_touch=True, device_scale_factor=2)
        page = ctx.new_page()
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.add_init_script("window.perfSamples=[];addEventListener('island-outbreak-performance',e=>perfSamples.push(e.detail))")
        cdp = ctx.new_cdp_session(page)
        def canvas():
            return page.locator('#game canvas').evaluate('e=>({w:e.width,h:e.height,preserved:e.getContext("webgl2").getContextAttributes().preserveDrawingBuffer})')
        def dimensions(ratio):
            r = canvas()
            check(f'graphics resolution {ratio}', r['w'] == math.floor(800*ratio) and r['h'] == math.floor(360*ratio), r)
        def touch(kind, points):
            cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'id': i, 'x': x, 'y': y} for i,x,y in points]})
        def metrics(width, height, orientation):
            cdp.send('Emulation.setDeviceMetricsOverride', {'width':width, 'height':height, 'deviceScaleFactor':2, 'mobile':True, 'screenOrientation': {'type':orientation, 'angle':90 if 'landscape' in orientation else 0}})
            page.wait_for_timeout(300)
        try:
            page.goto(url, wait_until='domcontentloaded')
            page.wait_for_function('document.querySelector("#survivalLobby").classList.contains("show")', timeout=45000)
            page.locator('#enterGameDisplayMode').tap(timeout=45000)
            page.locator('#lobbyOptionsBtn').tap()
            page.locator('[data-settings-tab="graphics"]').tap()
            for quality, ratio in (('low', .85), ('med', 1), ('high', 1.25), ('low', .85)):
                page.locator('#graphicsSelect').select_option(quality)
                dimensions(ratio)
            check('drawing buffer retention disabled', not canvas()['preserved'])
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function('document.querySelector("#survivalLobby").classList.contains("show")', timeout=45000)
            if page.locator('#displayModeGate').is_visible():
                page.locator('#enterGameDisplayMode').tap()
            dimensions(.85)
            check('graphics preference survives reload', page.evaluate('JSON.parse(localStorage.getItem("world-wildlife-settings-v1")).graphics === "low"'))
            page.locator('#startRunBtn').tap()
            page.evaluate('''() => {window.hudWrites=0;window.hudObserver=new MutationObserver(ms=>hudWrites+=ms.length);hudObserver.observe(document.querySelector('#wildcardHud'),{subtree:true,childList:true,characterData:true});}''')
            page.wait_for_function('(()=>{const c=document.querySelector("#miniCanvas");return c.width===Math.floor(c.clientWidth*2)&&c.height===Math.floor(c.clientHeight*2)})()')
            page.evaluate('''() => {window.radarResizes=0;window.radarObserver=new MutationObserver(ms=>radarResizes+=ms.length);radarObserver.observe(document.querySelector('#miniCanvas'),{attributes:true,attributeFilter:['width','height']});}''')
            page.wait_for_timeout(2000)
            check('radar does not reallocate unchanged backing store', page.evaluate('radarResizes===0'), page.evaluate('radarResizes'))
            check('mobile HUD has no live backdrop blurs', page.evaluate("['#settingsBtn','#prompt','#stick','#shootBtn','#aimBtn','#reloadBtn','#weaponSwitchBtn','#jumpBtn','#slideBtn'].every(s=>getComputedStyle(document.querySelector(s)).backdropFilter==='none')"))
            page.locator('#miniCanvas').tap()
            page.wait_for_timeout(400)
            check('full map opens and renders', page.locator('#mapOverlay').is_visible() and page.locator('#mapCanvas').evaluate('c=>c.width>0&&c.height>0'))
            page.evaluate('''() => {window.fullMapResizes=0;window.fullMapObserver=new MutationObserver(ms=>fullMapResizes+=ms.length);fullMapObserver.observe(document.querySelector('#mapCanvas'),{attributes:true,attributeFilter:['width','height']});}''')
            page.wait_for_timeout(400)
            check('full map does not reallocate unchanged backing store', page.evaluate('fullMapResizes===0'))
            page.screenshot(path=str(out/'full-map.png'))
            page.locator('#mapClose').tap()
            check('ready Wildcard labels do not rewrite each frame', page.evaluate('hudWrites === 0'), page.evaluate('hudWrites'))
            page.evaluate('document.activeElement?.blur()')
            page.keyboard.press('p')
            with page.expect_download(timeout=20000) as download_info:
                page.keyboard.press('Enter')
            photo = out/'photo-export.png'
            download_info.value.save_as(str(photo))
            with Image.open(photo) as image:
                colors = image.convert('RGB').resize((80,36)).getcolors(80*36)
                check('photo export contains rendered scene', image.size == (680,306) and len(colors or []) > 20, {'size':image.size, 'colors':len(colors or [])})
            page.keyboard.press('p')
            # Move sideways away from the homestead wall with a real held touch.
            start = page.evaluate('JSON.parse(localStorage.getItem("virtual-family-core-v2")).player')
            stick = page.locator('#stick').bounding_box()
            x,y = stick['x']+stick['width']/2, stick['y']+stick['height']/2
            touch('touchStart', [(1,x,y)])
            touch('touchMove', [(1,x+55,y)])
            for _ in range(6):
                page.wait_for_timeout(5000)
            touch('touchEnd', [])
            page.wait_for_timeout(6000)
            finish = page.evaluate('JSON.parse(localStorage.getItem("virtual-family-core-v2")).player')
            displacement = math.hypot(finish['x']-start['x'], finish['z']-start['z'])
            samples = page.evaluate('perfSamples')
            check('touch movement crosses chunk boundaries', displacement > 16, {'start':start,'finish':finish,'distance':displacement})
            check('cooperative streaming observed', any((s.get('chunkPumpCount') or 0)>0 for s in samples))
            check('streaming queue drains after release', bool(samples) and samples[-1]['chunkQueueDepth']==0, samples[-1] if samples else None)
            check('core timing counts cover every frame', bool(samples) and all(s['simulationSamples']==s['frames']==s['renderSamples'] for s in samples))
            check('complete callback and scheduling gap diagnostics present', bool(samples) and all(s['perfBuildTag']=='mobile-perf-3' and s['frameCallbackAvgMs']>=s['simulationAvgMs'] and s['frameGapAvgMs']>=0 for s in samples))
            check('draw-call summaries internally consistent', bool(samples) and all(s['drawCallsMin']<=s['drawCallsAvg']<=s['drawCallsMax'] for s in samples))
            page.screenshot(path=str(out/'gameplay-after-streaming.png'))
            page.locator('#survivalPauseBtn').tap()
            metrics(360,800,'portraitPrimary')
            check('portrait displays gate', page.locator('#displayModeGate').is_visible())
            metrics(800,360,'landscapePrimary')
            dimensions(.85)
            check('radar retains correct backing size after orientation recovery', page.locator('#miniCanvas').evaluate('c=>c.width===Math.floor(c.clientWidth*2)&&c.height===Math.floor(c.clientHeight*2)'))
            check('orientation recovery stays paused', page.locator('#survivalPauseOverlay').is_visible())
            report['performanceSamples'] = samples
        except Exception as exc:
            report['errors'].append(str(exc))
        finally:
            (out/'report.json').write_text(json.dumps(report,indent=2))
            browser.close()
    print(json.dumps({'checks':len(report['checks']), 'errors':report['errors']},indent=2))
    if report['errors']:
        raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:4173')
    parser.add_argument('--out', type=Path, default=Path('/workspace/scratch/island-perf-device'))
    args = parser.parse_args()
    run(args.url, args.out)
