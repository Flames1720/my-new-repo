"""Mocked signup transport; no real account/email is created."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 browser=p.chromium.launch();page=browser.new_page();requests=[]
 def auth(route):
  if '/signup' in route.request.url:
   requests.append(route.request.url);route.fulfill(status=400,json={'code':'unexpected_failure','msg':'Database error saving new user'})
  else:route.fulfill(json={})
 page.route('**/auth/v1/**',auth)
 page.route('**/rest/v1/rpc/pilot_availability',lambda route:route.fulfill(json={'capacity':20,'remaining':14}))
 page.goto('http://127.0.0.1:4192/control-center.html')
 page.locator('[name=email]').fill('fixture@example.invalid');page.locator('[name=password]').fill('fixture-password-123')
 page.evaluate("const b=document.querySelector('[data-signup]');b.onclick();b.onclick();")
 page.wait_for_function("document.querySelector('.pilot-card [role=status]:not([data-availability])').textContent.includes('Account creation could not finish')")
 assert len(requests)==1
 assert page.locator('[data-signup]').is_enabled()
 assert '14 of 20' in page.locator('[data-availability]').inner_text()
 print('PASS: concurrent signup attempts issue one request, duplicate failure has recovery guidance, buttons unlock and live availability renders')
 browser.close()
