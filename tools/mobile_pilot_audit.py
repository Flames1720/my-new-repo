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
with sync_playwright() as pw:
 browser=pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 checks=0
 for size,consent in [((854,393),True),((360,691),False)]:
  context=browser.new_context(viewport={'width':size[0],'height':size[1]},is_mobile=True,has_touch=True)
  page=context.new_page();errors=[];reports=[];state={'consent':None,'epoch':str(uuid.uuid4())};page.on('pageerror',lambda e:errors.append(str(e)))
  def auth(route):
   if '/token' in route.request.url:
    if (route.request.post_data_json or {}).get('password')=='wrong-password':route.fulfill(status=400,json={'error':'invalid_grant','error_description':'Invalid login credentials'})
    else:route.fulfill(json=SESSION)
   elif '/user' in route.request.url:route.fulfill(json=USER)
   else:route.fulfill(json={'user':USER,'session':None})
  def rpc(route):
   name=route.request.url.split('/')[-1];data=route.request.post_data_json or {}
   if name=='pilot_admit':result={'admitted':True,'consent':state['consent'],'epoch':state['epoch'],'progress':{},'admin':False}
   elif name=='pilot_consent':state['consent']=data['allowed'];state['epoch']=str(uuid.uuid4());result=state['epoch']
   elif name=='pilot_report':reports.append(data);result=True
   else:result=None
   route.fulfill(json=result)
  page.route('**/auth/v1/**',auth);page.route('**/rest/v1/rpc/**',rpc)
  page.goto(URL,wait_until='domcontentloaded');page.locator('.pilot-card').wait_for()
  assert page.locator('#game canvas').count()==0;checks+=1
  page.locator('[name=email]').fill('fixture@example.invalid');page.locator('[name=password]').fill('fixture-password-123')
  page.get_by_role('button',name='CREATE ACCOUNT',exact=True).tap();page.get_by_role('status').filter(has_text='Check your email').wait_for();checks+=1
  page.get_by_role('button',name='RESET PASSWORD',exact=True).tap();page.get_by_role('status').filter(has_text='password reset email').wait_for();checks+=1
  page.locator('[name=password]').fill('wrong-password');page.locator('.pilot-card button[type=submit]').tap();page.get_by_role('status').filter(has_text='Invalid login credentials').wait_for();checks+=1
  assert page.locator('#game canvas').count()==0;checks+=1
  page.locator('[name=password]').fill('fixture-password-123');page.locator('.pilot-card button[type=submit]').tap()
  choice=page.get_by_role('button',name='ALLOW GAME DATA' if consent else 'PLAY WITHOUT SHARING',exact=True);choice.wait_for();choice.tap()
  page.wait_for_function('!document.querySelector(".pilot-overlay")',timeout=45000)
  if size[0]>size[1]:
   page.wait_for_function('document.querySelector("#survivalLobby").classList.contains("show")',timeout=45000)
   page.locator('#enterGameDisplayMode').tap()
  assert page.locator('#diagnosticsCopy').count()==0 and page.locator('#diagnosticCopyBtn').count()==0;checks+=1
  assert page.locator('[data-settings-tab=diagnostics]').inner_text()=='GAME DATA';checks+=1
  assert page.evaluate('window.__islandOutbreakPerfEnabled')==consent;checks+=1
  sample={'windowMs':5000,'frames':200,'slowFramesOver50ms':2,'worstFrameMs':60,'simulationAvgMs':2,'renderAvgMs':12,'frameCallbackAvgMs':14,'frameGapAvgMs':11,'frameHistogram':{'le17':100,'le34':98,'le100':2},'canvasWidth':854,'canvasHeight':393,'pixelRatio':1}
  page.evaluate('(detail)=>{for(let i=0;i<6;i++)dispatchEvent(new CustomEvent("island-outbreak-performance",{detail}))}',sample)
  if consent:
   page.wait_for_function('true');page.wait_for_timeout(500)
   assert len(reports)==1 and len(reports[0]['samples'])==6;assert reports[0]['samples'][0]['histogram']['le17']==100;checks+=2
   page.locator('#lobbyOptionsBtn').tap();page.locator('[data-settings-tab=diagnostics]').tap()
   page.get_by_role('button',name='STOP SHARING & DELETE REPORTS').tap();page.wait_for_function('window.__islandOutbreakPerfEnabled===false');checks+=1
   page.evaluate('(detail)=>{for(let i=0;i<6;i++)dispatchEvent(new CustomEvent("island-outbreak-performance",{detail}))}',sample)
   page.wait_for_timeout(250);assert len(reports)==1;checks+=1
  else: assert not reports;checks+=1
  assert not errors,errors;checks+=1
  Path('/workspace/scratch/pilot').mkdir(exist_ok=True);page.screenshot(path=f'/workspace/scratch/pilot/mobile-{size[0]}.png')
  context.close()
 context=browser.new_context(viewport={'width':854,'height':393},is_mobile=True,has_touch=True)
 page=context.new_page();state={'consent':False,'epoch':str(uuid.uuid4())}
 page.route('**/auth/v1/**',auth);page.route('**/rest/v1/rpc/**',rpc)
 page.goto(URL+'/?recovery=1#access_token='+TOKEN+'&refresh_token=fixture&token_type=bearer&expires_in=3600&type=recovery',wait_until='domcontentloaded')
 page.get_by_role('button',name='SAVE NEW PASSWORD',exact=True).wait_for()
 page.locator('[name=password]').fill('replacement-password-123');page.get_by_role('button',name='SAVE NEW PASSWORD',exact=True).tap()
 page.wait_for_function('!document.querySelector(".pilot-overlay")',timeout=45000);assert 'recovery' not in page.url;checks+=1
 context.close()
 browser.close()
 print(f'PASS: {checks} mobile pilot checks: signup gate, consent/decline, hidden copy UI, automatic normalized batches, histogram, revoke and no reports without consent. Auth transport mocked; database permissions tested against PostgreSQL.')
