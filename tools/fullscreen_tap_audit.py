"""Real Chromium touch fullscreen using the shipped handler/function, with isolated DOM."""
import json,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
main=(root/'src/main.ts').read_text();entry=main[main.index('async function enterRequiredDisplayMode()'):main.index("document.addEventListener('fullscreenchange'",main.index('async function enterRequiredDisplayMode()'))]
helper=(root/'src/display-mode.ts').read_text()
fixture='''const enterGameDisplayMode=document.querySelector('#enterGameDisplayMode'),fullscreenBtn=null,displayModeMessage=document.querySelector('p');let fullscreenRequestPending=false,fullscreenFailureMessage='',browserDisplayMode=false,offerBrowserDisplayMode=false;function needsBrowserDisplayMode(){return offerBrowserDisplayMode||!supportsNativeFullscreen(document.documentElement);}function isLandscapeDisplay(){return innerWidth>innerHeight;}function syncDisplayMode(){window.ready=!!document.fullscreenElement||browserDisplayMode;enterGameDisplayMode.disabled=fullscreenRequestPending||!isLandscapeDisplay();displayModeMessage.textContent=fullscreenFailureMessage;}'''
source=helper+'\n'+fixture+'\n'+entry
code=subprocess.check_output(['node','--input-type=module','-e',"import ts from 'typescript';let s='';for await(const chunk of process.stdin)s+=chunk;process.stdout.write(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);"],input=source.encode(),cwd=root).decode()
with sync_playwright() as pw:
 browser=pw.chromium.launch();context=browser.new_context(viewport={'width':854,'height':393},is_mobile=True,has_touch=True);page=context.new_page()
 page.goto('http://127.0.0.1:4192/control-center.html');page.set_content('<button id="enterGameDisplayMode">ENTER FULLSCREEN</button><p></p>')
 page.evaluate('''window.calls=0;window.activations=[];window.rejectNext=false;const native=document.documentElement.requestFullscreen.bind(document.documentElement);document.documentElement.requestFullscreen=options=>{calls++;activations.push(navigator.userActivation.isActive);return rejectNext?(rejectNext=false,Promise.reject(new Error('fixture blocked'))):native(options)};document.querySelector('button').addEventListener('pointerdown',()=>window.callsOnDown=calls);''')
 page.add_script_tag(type='module',content=code)
 page.locator('button').tap();page.wait_for_function('window.ready===true && !document.querySelector("button").disabled')
 assert page.evaluate('calls===1 && callsOnDown===0 && activations[0]===true && !!document.fullscreenElement')
 page.evaluate('document.exitFullscreen()');page.wait_for_function('!document.fullscreenElement')
 page.evaluate('rejectNext=true');page.locator('button').tap();page.wait_for_function('document.querySelector("p").textContent.includes("blocked")');assert page.locator('button').is_enabled()
 page.locator('button').tap();page.wait_for_function('window.ready');assert page.evaluate('calls===2 && !document.fullscreenElement && activations.every(Boolean)')
 page.reload();page.set_content('<button id="enterGameDisplayMode">CONTINUE IN BROWSER</button><p></p>');page.evaluate('document.documentElement.requestFullscreen=undefined;document.documentElement.webkitRequestFullscreen=undefined');page.add_script_tag(type='module',content=code);page.locator('button').tap();page.wait_for_function('window.ready');assert not page.evaluate('!!document.fullscreenElement')
 context.close();browser.close()
print('PASS: Android-style first completed tap invokes native fullscreen once with active user gesture; rejected request offers explicit browser entry; unavailable fullscreen API allows first-tap browser entry.')
