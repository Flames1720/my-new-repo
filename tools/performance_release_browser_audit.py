"""Production build with isolated account transport: actual touch combat, no live writes."""
exec(open('tools/control_center_browser_audit.py').read().split('fixture=json.loads')[0])
with sync_playwright() as pw:
 browser=pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':854,'height':393},is_mobile=True,has_touch=True,device_scale_factor=2)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('Object.defineProperty(HTMLElement.prototype,"requestFullscreen",{value:undefined});Object.defineProperty(HTMLElement.prototype,"webkitRequestFullscreen",{value:undefined});window.perfSamples=[];addEventListener("island-outbreak-performance",e=>perfSamples.push(e.detail));window.combatGL={links:0,creates:0,deletes:0};const proto=WebGL2RenderingContext.prototype,buffers=new Set(),bound=new Map();const link=proto.linkProgram;proto.linkProgram=function(program){if(this.getAttachedShaders(program).some(s=>this.getShaderSource(s).includes("SHADER_NAME SurvivalTracer")))combatGL.links++;return link.call(this,program)};const bind=proto.bindBuffer;proto.bindBuffer=function(target,buffer){bound.set(target,buffer);return bind.call(this,target,buffer)};const data=proto.bufferData;proto.bufferData=function(target,array,...args){if(array?.byteLength===24&&!buffers.has(bound.get(target))){buffers.add(bound.get(target));combatGL.creates++}return data.call(this,target,array,...args)};const del=proto.deleteBuffer;proto.deleteBuffer=function(buffer){if(buffers.has(buffer))combatGL.deletes++;return del.call(this,buffer)}')
 def auth(route):route.fulfill(json=USER if '/user' in route.request.url else SESSION)
 def rpc(route):
  name=route.request.url.split('/')[-1]
  if name=='pilot_admit':result={'admitted':True,'consent':False,'epoch':str(uuid.uuid4()),'progress':{'tutorialCompleted':True,'lobbyTourCompleted':True},'admin':False}
  elif name=='pilot_availability':result={'capacity':20,'remaining':9}
  else:result=True
  route.fulfill(json=result)
 page.route('**/auth/v1/**',auth);page.route('**/rest/v1/rpc/**',rpc)
 page.goto('http://127.0.0.1:4192/',wait_until='domcontentloaded');page.locator('[name=email]').fill('fixture@example.invalid');page.locator('[name=password]').fill('fixture-password-123');page.locator('.pilot-card button[type=submit]').tap()
 page.locator('#enterGameDisplayMode').tap(timeout=60000);page.locator('#startRunBtn').tap(timeout=60000)
 cdp=context.new_cdp_session(page)
 def fire():
  r=page.locator('#shootBtn').bounding_box();cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':r['x']+r['width']/2,'y':r['y']+r['height']/2,'id':1}]});page.wait_for_timeout(150);cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(550)
 ammo=int(page.locator('#survivalAmmo').inner_text());fire();warm=page.evaluate('({...combatGL})');assert warm['links']>0 and warm['creates']>0
 for _ in range(3):fire()
 repeated=page.evaluate('({...combatGL})');assert repeated==warm,(warm,repeated);assert int(page.locator('#survivalAmmo').inner_text())<ammo
 page.locator('#reloadBtn').tap();page.wait_for_function(f'Number(document.querySelector("#survivalAmmo").textContent)==={ammo}',timeout=15000)
 for weapon in ['W-870','AR-15']:
  page.locator('#weaponSwitchBtn').tap();assert weapon.upper() in page.locator('#survivalWeapon').inner_text();mag=int(page.locator('#survivalAmmo').inner_text());fire();assert int(page.locator('#survivalAmmo').inner_text())<mag
 page.locator('#survivalPauseBtn').tap();assert page.locator('#survivalPauseOverlay').is_visible();page.locator('#restartPausedRunBtn').tap();page.wait_for_timeout(250)
 assert int(page.locator('#survivalAmmo').inner_text())==mag
 page.locator('#survivalPauseBtn').tap();page.locator('#leaveSurvivalBtn').tap();assert page.locator('#survivalLobby').is_visible()
 assert not errors,errors
 Path('/workspace/scratch').mkdir(exist_ok=True);page.screenshot(path='/workspace/scratch/performance-release-lobby.png')
 context.close();browser.close()
print('PASS: actual mobile pistol/rifle/shotgun firing, reload, pooled tracer buffers/shaders, pause/restart/quit, no runtime errors')
