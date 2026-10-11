"""Real lobby tour with isolated account transport; no live account writes."""
exec(open('tools/control_center_browser_audit.py').read().split('fixture=json.loads')[0])
with sync_playwright() as pw:
 browser=pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for width,height,old in [(854,393,False),(812,265,False),(640,300,False),(854,393,True)]:
  USER['created_at']='2026-10-11T00:00:00Z' if old else '2026-10-12T00:00:00Z'
  context=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));progress={};calls=[]
  page.add_init_script('Object.defineProperty(HTMLElement.prototype,"requestFullscreen",{value:undefined});Object.defineProperty(HTMLElement.prototype,"webkitRequestFullscreen",{value:undefined})')
  def auth(route):route.fulfill(json=USER if '/user' in route.request.url else SESSION)
  def rpc(route):
   name=route.request.url.split('/')[-1];calls.append(name)
   if name=='pilot_admit':result={'admitted':True,'consent':False,'epoch':str(uuid.uuid4()),'progress':progress,'admin':False}
   elif name=='pilot_availability':result={'capacity':20,'remaining':14}
   elif name=='pilot_save_progress':progress.update(route.request.post_data_json['value']);result=True
   else:result=True
   route.fulfill(json=result)
  page.route('**/auth/v1/**',auth);page.route('**/rest/v1/rpc/**',rpc)
  def login():
   page.goto('http://127.0.0.1:4192/',wait_until='domcontentloaded')
   page.locator('[name=email]').fill('fixture@example.invalid');page.locator('[name=password]').fill('fixture-password-123');page.locator('.pilot-card button[type=submit]').tap()
   page.locator('#enterGameDisplayMode').tap(timeout=60000)
  login()
  if old:
   assert page.locator('.lobby-tour').is_hidden()
   page.locator('#lobbyOptionsBtn').tap();page.locator('[data-settings-tab="controls"]').tap();page.locator('#lobbyTourBtn').tap()
  page.locator('#lobbyTourTitle').wait_for(timeout=60000)
  assert page.locator('#survivalLobby').evaluate('(e)=>e.inert')
  page.set_viewport_size({'width':width-10,'height':height});page.wait_for_timeout(100)
  assert page.locator('#survivalLobby').evaluate('(e)=>e.inert')
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
  for index,title in enumerate(['Deploy to the island','Choose your weapon','Equip cards · spend XP','Make the controls yours']):
   assert page.locator('#lobbyTourTitle').inner_text()==title
   target=page.locator('.lobby-tour-spotlight').bounding_box();assert target and target['width']>10 and target['height']>10
   # Spotlight extends four pixels; allow one pixel for fractional browser layout.
   assert target['x']>=-5 and target['y']>=-5 and target['x']+target['width']<=width+5 and target['y']+target['height']<=height+5,target
   panel=page.locator('.lobby-tour-panel').bounding_box();assert panel and panel['x']>=0 and panel['y']>=0 and panel['x']+panel['width']<=width and panel['y']+panel['height']<=height
   button=page.locator('.lobby-tour-actions button').last
   assert button.evaluate('(e)=>{let r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e}')
   if index==1:
    assert page.locator('[data-lobby-panel="kit"]').get_attribute('aria-hidden')=='false'
    assert page.locator('[data-lobby-panel="kit"]').evaluate('(e)=>getComputedStyle(e).opacity')=='1'
    page.locator('.lobby-tour-actions button').filter(has_text='BACK').tap();assert page.locator('#lobbyTourTitle').inner_text()=='Deploy to the island'
    page.locator('.lobby-tour-actions button').filter(has_text='NEXT').tap()
   if index==2:
    assert page.locator('[data-lobby-panel="wildcards"]').get_attribute('aria-hidden')=='false'
    page.wait_for_timeout(1000)
    assert page.locator('#wildcardCollection').bounding_box()['height']>0
    assert page.locator('#lobbyWildcardsPanel').evaluate('(e)=>getComputedStyle(e).opacity')=='1'
    page.screenshot(path=f'/workspace/scratch/lobby-tour-{width}.png')
   button.tap()
  assert page.locator('.lobby-tour').is_hidden();assert not page.locator('#survivalLobby').evaluate('(e)=>e.inert')
  assert page.locator('[data-lobby-panel="mission"]').get_attribute('aria-hidden')=='false'
  assert page.locator('#lobbyWeaponSelect').input_value()=='pistol'
  page.wait_for_timeout(1900);assert progress.get('lobbyTourCompleted') is True
  assert all(name in ['pilot_admit','pilot_availability','pilot_save_progress'] for name in calls),calls
  if not old:
   page.reload(wait_until='domcontentloaded');page.locator('#enterGameDisplayMode').tap(timeout=60000);page.wait_for_timeout(200);assert page.locator('.lobby-tour').is_hidden()
  assert not errors,errors
  context.close()
 browser.close()
print('PASS: lobby tour responsive bounds/hit targets, real sections, Back, account completion, no repeat, existing-account replay, unchanged loadout')
