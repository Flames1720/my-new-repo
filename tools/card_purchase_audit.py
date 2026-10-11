"""Run against a local VITE_PILOT_ENABLED=false build at port 4190. Uses isolated browser storage."""
import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 c=b.new_context(viewport={'width':854,'height':393})
 c.add_init_script('if (!localStorage.getItem("island-outbreak-meta-v1")) localStorage.setItem("island-outbreak-meta-v1",'+json.dumps(json.dumps({'xp':1850,'earnedXp':1850,'bestRunKills':10}))+')')
 page=c.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:4190',wait_until='domcontentloaded')
 page.wait_for_function('document.querySelector("#lobbyCurrency").textContent==="1890 XP"',timeout=120000)
 page.locator('#enterGameDisplayMode').click()
 page.locator('#achievementReveal').wait_for(state='visible',timeout=30000)
 page.locator('.rewardFlip').click();assert page.locator('.rewardName').inner_text()=='FIRST TEN'
 page.locator('.rewardCollect').click()
 page.locator('[data-lobby-page=wildcards]').click()
 card=page.locator('.wildcardCard').filter(has_text='QUICK HANDS')
 card.click();card.click()
 page.locator('#achievementReveal').wait_for(state='visible')
 page.locator('.rewardFlip').click();page.locator('.rewardCollect').click()
 state=page.evaluate('JSON.parse(localStorage.getItem("island-outbreak-meta-v1"))')
 assert state['xp']==90 and state['earnedXp']==1890,state
 assert state['unlockedWildcards']==['shockwave','field-medic','quick-hands'],state
 assert state['earnedAchievements']==['first-ten'] and state['pendingCards']==[],state
 assert page.locator('#lobbyNavLevel').inner_text()=='LV 13'
 print('Purchase and reveal passed',state,flush=True);page.reload();page.wait_for_function('document.querySelector("#lobbyCurrency").textContent==="90 XP"',timeout=120000)
 print('errors',errors,flush=True);assert not errors,errors
 print('Real mobile-sized lobby: achievement grants XP once, card purchase debits 1,800 XP, level preserved, reveal/collect and reload persistence passed')
 b.close()
