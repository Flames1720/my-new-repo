"""Actual mobile game UI with mocked account transport; no live writes."""
exec(open('tools/control_center_browser_audit.py').read().split('fixture=json.loads')[0])
USER['created_at']='2026-10-11T00:00:00Z'
with sync_playwright() as pw:
 browser=pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for width,height,custom in [(854,393,False)]:
  context=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script('Object.defineProperty(HTMLElement.prototype,"requestFullscreen",{value:undefined});Object.defineProperty(HTMLElement.prototype,"webkitRequestFullscreen",{value:undefined})')
  def auth(route):route.fulfill(json=USER if '/user' in route.request.url else SESSION)
  def rpc(route):
   name=route.request.url.split('/')[-1]
   if name=='pilot_admit':result={'admitted':True,'consent':False,'epoch':str(uuid.uuid4()),'progress':{'tutorialCompleted':True,'hudLayout':{'shoot':{'x':12,'y':25,'size':60,'opacity':0.7}}} if custom else {},'admin':False}
   elif name=='pilot_availability':result={'capacity':20,'remaining':14}
   else:result=True
   route.fulfill(json=result)
  page.route('**/auth/v1/**',auth);page.route('**/rest/v1/rpc/**',rpc)
  page.goto('http://127.0.0.1:4192/',wait_until='domcontentloaded');page.locator('[name=email]').fill('fixture@example.invalid');page.locator('[name=password]').fill('fixture-password-123');page.locator('.pilot-card button[type=submit]').tap()
  page.locator('#enterGameDisplayMode').tap(timeout=60000);page.locator('#startRunBtn').tap(timeout=60000)
  assert page.locator('.first-run-tutorial').is_hidden()
  page.locator('#survivalPauseBtn').tap()
  page.locator('#leaveSurvivalBtn').tap()
  page.locator('#lobbyOptionsBtn').tap()
  page.locator('[data-settings-tab="controls"]').tap()
  page.locator('#practiceTutorialBtn').tap()
  page.locator('.first-run-tutorial strong').wait_for(timeout=60000)
  assert page.locator('.first-run-tutorial strong').inner_text()=='Move'
  cdp=context.new_cdp_session(page)
  def touch(kind,x,y):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':x,'y':y,'id':1}]})
  touch('touchStart',width*.2,height*.65)
  touch('touchMove',width*.2,height*.65-65)
  page.wait_for_function('document.querySelector(".first-run-tutorial strong").textContent==="Look around"',timeout=20000)
  touch('touchEnd',0,0)
  touch('touchStart',width*.73,height*.40)
  for i in range(1,9):touch('touchMove',width*.73+i*12,height*.40);page.wait_for_timeout(50)
  touch('touchEnd',0,0)
  page.wait_for_function('document.querySelector(".first-run-tutorial strong").textContent==="Aim"')
  page.locator('#aimBtn').tap()
  page.wait_for_function('document.querySelector(".first-run-tutorial strong").textContent==="Fire"')
  page.locator('#shootBtn').tap()
  page.wait_for_function('document.querySelector(".first-run-tutorial strong").textContent==="Reload"')
  page.locator('#reloadBtn').tap()
  page.wait_for_function('document.querySelector(".first-run-tutorial strong").textContent==="Use a field card"')
  page.locator('#wildcardBtn1').tap()
  page.wait_for_function('document.querySelector(".first-run-tutorial strong").textContent==="Ready to survive"')
  assert page.locator('#survivalWave').inner_text()=='SAFE START'
  assert page.locator('#survivalZombies').inner_text()==''
  page.screenshot(path='/workspace/scratch/tutorial-ready.png')
  page.locator('.first-run-tutorial button').tap()
  assert page.locator('.first-run-tutorial').is_hidden()
  assert page.evaluate('Object.keys(localStorage).some(k=>k.startsWith("island-tutorial-v1:") && localStorage[k]==="complete")')
  page.locator('#survivalPauseBtn').tap()
  page.locator('#restartPausedRunBtn').tap()
  assert page.locator('.first-run-tutorial').is_hidden()
  assert page.locator('#survivalWave').inner_text().startswith('PREP')
  assert not errors,errors
  context.close()
 browser.close()
print('PASS: existing account bypass, Settings practice entry, full walkthrough and restart bypass')
