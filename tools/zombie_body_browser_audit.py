"""Render the real optimized enemy models in a small scene; no account transport."""
from pathlib import Path
from playwright.sync_api import sync_playwright
html='''<!doctype html><html><body style="margin:0;background:#07110f"><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import {ZombieSurvivalSystem} from '/src/zombie-survival.ts';
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,1000/500,.1,100);
camera.position.set(0,2.3,7);camera.lookAt(0,1,0);scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff,0x53634a,2.5));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-3,8,6);scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:0x354334,roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor);
const game=new ZombieSurvivalSystem({scene,camera,getPlayerPosition:()=>camera.position,getTerrainHeight:()=>0,isWater:()=>false,getWaterDepth:()=>0,canOccupy:()=>true,getSightBlockers:()=>[],safeZones:[],lowPowerMode:true,respawnPlayer:()=>{},notify:()=>{},onStatus:()=>{},onDamage:()=>{},onDeath:()=>{}});
const actors=['walker','runner','brute'].map((type,i)=>game.createZombie(type,(i-1)*2,0));
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1000,500);document.body.append(renderer.domElement);
const counts=actors.map(a=>{let n=0;a.root.traverseVisible(o=>{if(o.isMesh)n++});return n});
renderer.render(scene,camera);window.modelAudit={counts,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
window.flashAudit=()=>{game.damageZombie(actors[1],1,false,false,true);renderer.render(scene,camera);return actors[1].bodyMaterial.emissive.getHex()===0x7c211c};
window.clearFlashAudit=()=>{game.updateZombie(actors[1],.2,camera.position,false);renderer.render(scene,camera);return actors[1].bodyMaterial.emissive.getHex()===0};
</script></body></html>'''
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']);page=browser.new_page(viewport={'width':1000,'height':500});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/zombie-model-audit',lambda r:r.fulfill(content_type='text/html',body=html));page.goto('http://127.0.0.1:4194/zombie-model-audit',wait_until='domcontentloaded');page.wait_for_function('window.modelAudit',timeout=30000)
 result=page.evaluate('modelAudit');assert result['counts']==[6,6,6],result;assert result['drawCalls']==19,result
 Path('/workspace/scratch').mkdir(exist_ok=True);page.screenshot(path='/workspace/scratch/optimized-zombie-models.png');assert page.evaluate('flashAudit()');assert page.evaluate('clearFlashAudit()');assert not errors,errors
 print('PASS: three real enemy models render in 19 calls including floor; hit flash expires; no WebGL/runtime errors',result);browser.close()
