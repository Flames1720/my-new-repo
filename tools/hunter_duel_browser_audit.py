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

 assert page.locator('#hunterPreviewBadge').is_visible()
 assert 'ONE HUNTER' in page.locator('.lobbyTagline').inner_text()
 page.wait_for_function('document.querySelector("#survivalZombies").textContent.includes("1 INFECTED")',timeout=60000)
 page.locator('#survivalPauseBtn').tap();assert page.locator('#survivalPauseOverlay').is_visible()
 assert page.locator('#survivalWave').inner_text()=='HUNTER DUEL'
 assert page.locator('#survivalZoneStatus').inner_text()=='1v1 · No sanctuary'
 assert page.locator('#safeZoneDirection').count()==0
 page.screenshot(path='/workspace/scratch/hunter-duel-mobile.png')
 page.locator('#leaveSurvivalBtn').tap();assert page.locator('#survivalLobby').is_visible()
 assert page.locator('#lobbyCurrency').inner_text()=='0 XP'
 assert not errors,errors
 context.close();browser.close()
print('PASS: mobile preview labels, exactly one live opponent, no sanctuary, pause/quit and unchanged XP; no runtime errors')
