"""Mobile pilot flow with explicit mocked Auth/RPC; DB rules are tested separately."""
import base64,json,time,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4175'
UID=str(uuid.uuid4())
def b64(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
TOKEN=b64({'alg':'HS256','typ':'JWT'})+'.'+b64({'sub':UID,'exp':int(time.time())+3600,'role':'authenticated'})+'.fixture'
USER={'id':UID,'aud':'authenticated','role':'authenticated','email':'fixture@example.invalid','email_confirmed_at':'2026-10-11T00:00:00Z','app_metadata':{'provider':'email'},'user_metadata':{},'created_at':'2026-10-11T00:00:00Z'}
SESSION={'access_token':TOKEN,'token_type':'bearer','expires_in':3600,'expires_at':int(time.time())+3600,'refresh_token':'fixture','user':USER}

server={'xp':300,'hudLayout':{'shoot':{'x':25,'y':30,'size':60,'opacity':0.7}}}
saves=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for visit in range(2):
  context=browser.new_context(viewport={'width':854,'height':393},is_mobile=True,has_touch=True)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def auth(route):route.fulfill(json=USER if '/user' in route.request.url else SESSION)
  def rpc(route):
   name=route.request.url.split('/')[-1];data=route.request.post_data_json or {}
   if name=='pilot_admit':result={'admitted':True,'consent':visit==1,'epoch':str(uuid.uuid4()),'progress':server,'admin':False}
   elif name=='pilot_save_progress':server.update(data['value']);saves.append(data['value']);result=None
   else:result=None
   route.fulfill(json=result)
  page.route('**/auth/v1/**',auth);page.route('**/rest/v1/rpc/**',rpc)
  page.goto(URL,wait_until='domcontentloaded')
  page.locator('[name=email]').fill('fixture@example.invalid');page.locator('[name=password]').fill('fixture-password-123');page.locator('.pilot-card button[type=submit]').tap()
  page.wait_for_function('!document.querySelector(".pilot-overlay")',timeout=45000)
  page.wait_for_function('document.querySelector("#survivalLobby").classList.contains("show")',timeout=45000)
  page.locator('#enterGameDisplayMode').tap()
  page.wait_for_function('(expected)=>document.querySelector("#lobbyCurrency").textContent===expected',arg=('300 XP' if visit==0 else '180 XP'))
  assert page.locator('#shootBtn').evaluate('e=>e.style.getPropertyValue("--hud-x")')=='25%'
  if visit==0:
   page.locator('[data-lobby-page=upgrades]').tap();page.locator('#upgradeHealthBtn').tap()
   page.wait_for_timeout(1800);assert server['xp']==180 and server['upgrades']['health']==1 and server['hudLayout']['shoot']['x']==25,(server,saves,page.locator('#lobbyCurrency').inner_text(),errors)
   page.locator('#lobbyOptionsBtn').tap();page.locator('[data-settings-tab=controls]').tap();page.locator('#hudCustomizeBtn').tap()
   page.locator('#hudSizeSlider').evaluate('e=>{e.value="72";e.dispatchEvent(new Event("input",{bubbles:true}))}')
   page.locator('#hudSaveBtn').scroll_into_view_if_needed();page.locator('#hudSaveBtn').tap()
   page.wait_for_timeout(1800);assert server['hudLayout']['shoot']['size']==72 and server['xp']==180
  else:
   assert page.locator('#shootBtn').evaluate('e=>e.style.getPropertyValue("--hud-size")')=='72px'
   assert server['upgrades']['health']==1
   page.evaluate('window.testWindows=[];addEventListener("island-outbreak-performance",e=>testWindows.push(e.detail.windowMs))')
   page.locator('#startRunBtn').tap()
   page.wait_for_function('testWindows.length>0',timeout=30000)
   page.evaluate('const originalNow=performance.now.bind(performance);performance.now=()=>originalNow()+125000')
   page.wait_for_function('testWindows.length>1',timeout=30000)
   page.wait_for_timeout(1200)
   assert page.evaluate('testWindows.every(ms=>ms>=5000)'),page.evaluate('testWindows')
  assert not errors,errors
  context.close()
 browser.close()
 print('PASS: HUD cloud restore, account-scoped cache, real XP display, upgrade cloud save, merged HUD/progression writes, fresh-browser restore and no short telemetry windows after two minutes. Auth/RPC transport explicitly mocked.')
