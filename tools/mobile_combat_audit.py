"""Touch combat regression and WebGL shader/buffer reuse probe; not a phone FPS benchmark."""
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright

def run(url, out):
    out.mkdir(parents=True, exist_ok=True)
    report = {'checks': [], 'errors': [], 'measurements': []}
    def check(label, value):
        report['checks'].append({'check': label, 'passed': bool(value)})
        print(label, 'PASS' if value else 'FAIL', flush=True)
        if not value: report['errors'].append(label)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        for width, height in [(854,393),(915,412)]:
            ctx = browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True,device_scale_factor=2)
            page = ctx.new_page()
            page.on('pageerror', lambda e: report['errors'].append(str(e)))
            page.add_init_script("""window.combatGL={links:0,creates:0,deletes:0};const proto=WebGL2RenderingContext.prototype, buffers=new Set(), bound=new Map();const link=proto.linkProgram;proto.linkProgram=function(program){if(this.getAttachedShaders(program).some(s=>this.getShaderSource(s).includes('SHADER_NAME SurvivalTracer')))combatGL.links++;return link.call(this,program)};const bind=proto.bindBuffer;proto.bindBuffer=function(target,buffer){bound.set(target,buffer);return bind.call(this,target,buffer)};const data=proto.bufferData;proto.bufferData=function(target,array,...args){if(array?.byteLength===24&&!buffers.has(bound.get(target))){buffers.add(bound.get(target));combatGL.creates++}return data.call(this,target,array,...args)};const del=proto.deleteBuffer;proto.deleteBuffer=function(buffer){if(buffers.has(buffer))combatGL.deletes++;return del.call(this,buffer)}""")
            try:
                page.goto(url)
                page.wait_for_function('document.querySelector("#survivalLobby").classList.contains("show")',timeout=45000)
                page.locator('#enterGameDisplayMode').tap()
                page.locator('#startRunBtn').tap()
                page.wait_for_timeout(5000)
                cdp = ctx.new_cdp_session(page)
                def shoot():
                    r = page.locator('#shootBtn').bounding_box()
                    cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':r['x']+r['width']/2,'y':r['y']+r['height']/2,'id':1}]})
                    page.wait_for_timeout(250)
                    cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
                ammo = int(page.locator('#survivalAmmo').inner_text())
                shoot(); page.wait_for_timeout(500)
                warm = page.evaluate('({...combatGL})')
                check(f'{width}: tracer instrumentation observed first shot', warm['links'] > 0 and warm['creates'] > 0)
                for _ in range(3):
                    shoot(); page.wait_for_timeout(500)
                repeated = page.evaluate('({...combatGL})')
                report['measurements'].append({'viewport':f'{width}x{height}', 'warm':warm, 'repeated':repeated})
                check(f'{width}: warm tracers add no shader programs', repeated['links'] == warm['links'])
                check(f'{width}: warm tracers add no endpoint buffers', repeated['creates'] == warm['creates'])
                check(f'{width}: expired tracers retain endpoint buffers', repeated['deletes'] == warm['deletes'])
                check(f'{width}: shots consume ammunition', int(page.locator('#survivalAmmo').inner_text()) < ammo)
                page.screenshot(path=str(out/f'{width}-combat.png'),timeout=30000)
                page.locator('#reloadBtn').tap()
                page.wait_for_function(f'Number(document.querySelector("#survivalAmmo").textContent)==={ammo}',timeout=15000)
                check(f'{width}: reload restores magazine', int(page.locator('#survivalAmmo').inner_text()) == ammo)
                weapon = page.locator('#survivalWeapon').inner_text()
                page.locator('#weaponSwitchBtn').tap()
                check(f'{width}: weapon switching works', page.locator('#survivalWeapon').inner_text() != weapon)
                page.locator('#weaponSwitchBtn').tap()
                page.locator('#weaponSwitchBtn').tap()
                page.locator('#survivalPauseBtn').tap()
                check(f'{width}: pause accessible', page.locator('#survivalPauseOverlay').is_visible())
                page.screenshot(path=str(out/f'{width}-pause.png'),timeout=30000)
                page.locator('#restartPausedRunBtn').tap(); page.wait_for_timeout(500)
                check(f'{width}: restart restores ammunition', int(page.locator('#survivalAmmo').inner_text()) == ammo)
                page.locator('#survivalPauseBtn').tap(); page.locator('#leaveSurvivalBtn').tap()
                check(f'{width}: quit returns to lobby', page.locator('#survivalLobby').is_visible())
            except Exception as e:
                report['errors'].append(f'{width}: {e}')
            finally:
                ctx.close()
        browser.close()
    (out/'report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    if report['errors']: raise SystemExit(1)
if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--url',default='http://127.0.0.1:4173'); parser.add_argument('--out',type=Path,default=Path('/workspace/scratch/island-combat'))
    args=parser.parse_args(); run(args.url,args.out)
