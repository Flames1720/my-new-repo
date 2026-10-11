"""Actual mobile game UI with mocked account transport; no live writes."""
exec(open('tools/control_center_browser_audit.py').read().split('fixture=json.loads')[0])
with sync_playwright() as pw:
 browser=pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for width,height,custom in [(854,393,False),(812,265,False),(640,300,False),(854,393,True)]:
  context=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script('Object.defineProperty(HTMLElement.prototype,"requestFullscreen",{value:undefined});Object.defineProperty(HTMLElement.prototype,"webkitRequestFullscreen",{value:undefined})')
  def auth(route):route.fulfill(json=USER if '/user' in route.request.url else SESSION)
  def rpc(route):
   name=route.request.url.split('/')[-1]
   if name=='pilot_admit':result={'admitted':True,'consent':False,'epoch':str(uuid.uuid4()),'progress':{'tutorialCompleted':True,'hudLayout':{'shoot':{'x':12,'y':25,'size':60,'opacity':0.7}}} if custom else {'tutorialCompleted':True},'admin':False}
   elif name=='pilot_availability':result={'capacity':20,'remaining':14}
   else:result=True
   route.fulfill(json=result)
  page.route('**/auth/v1/**',auth);page.route('**/rest/v1/rpc/**',rpc)
  page.goto('http://127.0.0.1:4192/',wait_until='domcontentloaded');page.locator('[name=email]').fill('fixture@example.invalid');page.locator('[name=password]').fill('fixture-password-123');page.locator('.pilot-card button[type=submit]').tap()
  page.locator('#enterGameDisplayMode').tap(timeout=60000);page.locator('#startRunBtn').tap(timeout=60000)
  shoot=page.locator('#shootBtn').bounding_box();assert shoot
  assert abs(shoot['x']+shoot['width']/2-width*(.12 if custom else .88))<2
  if not custom:
   assert shoot['width']==72
   controls=page.locator('#touch .actions button[data-hud-id]').evaluate_all('(els)=>els.filter(e=>getComputedStyle(e).display!=="none").map(e=>({id:e.dataset.hudId,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))')
   for e in controls:assert e['x']>=0 and e['y']>=0 and e['x']+e['w']<=width and e['y']+e['h']<=height,e
   for selector in ['#shootBtn','#aimBtn','#jumpBtn','#slideBtn','#reloadBtn','#weaponSwitchBtn']:
    assert page.locator(selector).evaluate('(e)=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button")===e}'),selector
   page.locator('#aimBtn').tap();page.wait_for_function('document.body.classList.contains("aim-active")');page.wait_for_timeout(100);assert page.locator('#aimBtn').get_attribute('aria-pressed')=='true'
   page.locator('#aimBtn').tap();page.wait_for_function('!document.body.classList.contains("aim-active")')
   Path('/workspace/scratch').mkdir(exist_ok=True);page.screenshot(path=f'/workspace/scratch/two-thumbs-{width}.png')
  assert not errors,errors
  context.close()
 browser.close()
print('PASS: actual fresh two-thumb HUD, bounds at 854/812/640 landscape, tap aim on/off, cloud custom-layout preservation, no page errors')
