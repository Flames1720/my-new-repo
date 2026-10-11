"""Isolated auth/RPC fixtures against the production build; no live account writes."""
import base64,json,time,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4192/control-center.html'; UID=str(uuid.uuid4())
def b64(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
TOKEN=b64({'alg':'HS256','typ':'JWT'})+'.'+b64({'sub':UID,'exp':int(time.time())+3600,'role':'authenticated'})+'.fixture'
USER={'id':UID,'aud':'authenticated','role':'authenticated','email':'fixture@example.invalid','email_confirmed_at':'2026-10-11T00:00:00Z','app_metadata':{'provider':'email'},'user_metadata':{},'created_at':'2026-10-11T00:00:00Z'}
SESSION={'access_token':TOKEN,'token_type':'bearer','expires_in':3600,'expires_at':int(time.time())+3600,'refresh_token':'fixture','user':USER}
fixture=json.loads(Path('/workspace/scratch/control-center-fixture.json').read_text());fixture['action_associations'].append({'action':'<img src=x onerror="window.injected=true">','build':'center-fixture','occurrences':1,'windows':1,'slow_frame_percent':1,'render_avg_ms':1})
with sync_playwright() as pw:
 browser=pw.chromium.launch()
 for width,height,admin in [(360,800,True),(854,393,True),(360,800,False)]:
  context=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True,accept_downloads=True)
  page=context.new_page();errors=[];requests=[];state={'error':False};page.on('pageerror',lambda e:errors.append(str(e)))
  def auth(route):route.fulfill(json=USER if '/user' in route.request.url else SESSION)
  def rpc(route):
   name=route.request.url.split('/')[-1];data=route.request.post_data_json or {}
   if name=='pilot_admit':result={'admitted':True,'consent':True,'epoch':str(uuid.uuid4()),'progress':{},'admin':admin}
   elif name=='pilot_control_center':
    requests.append(data)
    if state['error']:route.fulfill(status=403,json={'message':'Owner access required'});return
    result=json.loads(json.dumps(fixture));result['days']=data['days'];result['selected_build']=data['selected_build']
    if data['days']==1:
     result['summary'].update({'windows':0,'players':0,'sessions':0,'fps':None,'latest_upload':None,'slow_frame_percent':None})
     for key in ['groups','phase_costs','action_associations','waves','daily','frame_distributions']:result[key]=[]
   else:result=None
   route.fulfill(json=result)
  page.route('**/auth/v1/**',auth);page.route('**/rest/v1/rpc/**',rpc)
  page.goto(URL,wait_until='domcontentloaded');page.locator('[name=email]').fill('fixture@example.invalid');page.locator('[name=password]').fill('fixture-password-123');page.locator('.pilot-card button[type=submit]').tap()
  if not admin:
   page.get_by_role('heading',name='Owner access required').wait_for();assert requests==[];context.close();continue
  page.wait_for_function('document.querySelector(".controlStatus")?.textContent.startsWith("Snapshot updated")')
  assert page.locator('.controlStats').inner_text().find('40 FPS')>=0
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,page.evaluate('document.documentElement.scrollWidth'))
  assert not page.evaluate('Boolean(window.injected)');assert page.locator('#controlCenter img').count()==0
  page.locator('[name=days]').select_option('30');page.wait_for_function('!document.querySelector("[name=days]").disabled')
  page.locator('[name=build]').select_option('center-fixture');page.wait_for_function('!document.querySelector("[name=build]").disabled');assert requests[-1]=={'days':30,'selected_build':'center-fixture'}
  with page.expect_download() as download:page.get_by_role('button',name='DOWNLOAD SUMMARY').tap()
  exported=json.loads(Path(download.value.path()).read_text());assert exported['summary']['fps']==40 and 'notes' in exported
  page.locator('[name=days]').select_option('1');page.wait_for_function('!document.querySelector("[name=days]").disabled');assert 'No performance reports match' in page.locator('.controlContent').inner_text()
  state['error']=True;page.get_by_role('button',name='REFRESH DATA').tap();page.wait_for_function('document.querySelector(".controlStatus")?.textContent.startsWith("Analytics unavailable")');assert page.locator('.controlStats').count()==0;assert page.get_by_role('button',name='DOWNLOAD SUMMARY').is_disabled()
  state['error']=False;page.locator('[name=days]').select_option('7');page.wait_for_function('document.querySelector(".controlStatus")?.textContent.startsWith("Snapshot updated")')
  page.screenshot(path=f'/workspace/scratch/control-center-{width}.png',full_page=True)
  assert not errors,errors
  context.close()
 browser.close()
print('PASS: owner login, ordinary-player denial, portrait/landscape overflow, filtered queries, JSON export, safe untrusted labels, empty data, failed refresh/retry and no page errors.')
