// Exact-hit regressions and a reproducible CPU workload, not a phone FPS estimate.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import * as THREE from 'three';
const data = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
async function module(name, deps = {}, source) {
 let code=ts.transpileModule(source ?? await readFile(`src/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 deps.three=import.meta.resolve('three');
 for(const [key,value] of Object.entries(deps)) code=code.replaceAll(`from '${key}'`,`from '${value}'`);
 return data(code);
}
const {ShotTargets}=await import(await module('shot-targets'));
const root=new THREE.Group(), wall=new THREE.Mesh(new THREE.BoxGeometry(2,3,.2),new THREE.MeshBasicMaterial());
root.position.set(0,0,-4);wall.position.y=1.5;root.add(wall);
const ray=new THREE.Raycaster(new THREE.Vector3(0,1.5,0),new THREE.Vector3(0,0,-1),0,100);
root.updateMatrixWorld(true);
const baseline=ray.intersectObjects([root,wall],true);
const index=new ShotTargets();const meshes=index.prepare([root,wall,root]);
assert.equal(meshes.length,1,'nested roots and repeats are deduplicated');
const hits=ray.intersectObjects(meshes,false);assert.equal(hits[0].object,baseline[0].object);assert.equal(hits[0].distance,baseline[0].distance);
wall.visible=false;assert.equal(ray.intersectObjects(index.prepare([root]),false)[0].object,wall,'hidden original source meshes remain authoritative');
root.position.x=5;assert.equal(ray.intersectObjects(index.prepare([root]),false).length,0,'moving ancestor refreshes child bounds');
root.position.x=0;wall.rotation.y=Math.PI/2;assert(ray.intersectObjects(index.prepare([root]),false)[0].distance<4,'moving door transform is current');
const deps={
 './terrain':data('export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));'),
 './survival-weapons':await module('survival-weapons'), './combat-effects':await module('combat-effects'),
 './shot-targets':await module('shot-targets'),'./zombie-body':await module('zombie-body'),
 './survival-audio':data('export const survivalSound=new Proxy({}, {get:()=>()=>{}});'),
 './settings':data('export const settings={current:{audioMaster:1,audioSfx:1}};')
};
const Before=(await import(await module('zombie-survival', {...deps},execFileSync('git',['show','7a8e009981274fa36e716b2f8298f1b0c8968279:src/zombie-survival.ts'],{encoding:'utf8'})))).ZombieSurvivalSystem;
const After=(await import(await module('zombie-survival',{...deps}))).ZombieSurvivalSystem;
function fixture(Controller){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(65,2,.1,200);camera.position.set(0,1.7,0);scene.add(camera);
 const geometry=new THREE.BoxGeometry(.6,3,.6),material=new THREE.MeshBasicMaterial();const blockers=[];
 for(let i=0;i<121;i++){
  const chunk=new THREE.Group();chunk.position.set((i%11-5)*16,0,(Math.floor(i/11)-5)*16);scene.add(chunk);
  for(let j=0;j<12;j++){
   const prop=new THREE.Group();prop.position.set(j%4*3,0,Math.floor(j/4)*3);chunk.add(prop);
   for(let part=0;part<3;part++){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(part*.2,1.5,0);prop.add(mesh);}
   if(Math.abs(chunk.position.x)<=32&&Math.abs(chunk.position.z)<=32){blockers.push(prop,prop.children[0]);}
  }
 }
 const game=new Controller({scene,camera,getPlayerPosition:()=>camera.position,getTerrainHeight:()=>0,isWater:()=>false,getWaterDepth:()=>0,canOccupy:()=>true,getSightBlockers:()=>blockers,safeZones:[],lowPowerMode:true,respawnPlayer:()=>{},notify:()=>{},onStatus:()=>{},onDamage:()=>{},onDeath:()=>{}});
 game.enabled=true;game.aimActive=true;game.spawnTracer=()=>{};game.spawnImpact=()=>{};
 scene.updateMatrixWorld(true);
 return {game,scene,camera};
}
const originalRaycast=THREE.Mesh.prototype.raycast;let raycasts=0;
THREE.Mesh.prototype.raycast=function(...args){raycasts++;return originalRaycast.apply(this,args)};
function bench(Controller){
 const {game,scene}=fixture(Controller),results={};
 for(const weapon of ['pistol','shotgun']){
  game.weapon=weapon;game.ammo[weapon]={mag:10000,reserve:0};
  for(let i=0;i<10;i++){game.fireCooldown=0;game.fire();}
  raycasts=0;let fullSceneUpdates=0;const update=scene.updateMatrixWorld.bind(scene);scene.updateMatrixWorld=(...args)=>{fullSceneUpdates++;return update(...args)};
  const timings=[];for(let i=0;i<50;i++){game.fireCooldown=0;const start=performance.now();game.fire();timings.push(performance.now()-start)}
  scene.updateMatrixWorld=update;timings.sort((a,b)=>a-b);
  results[weapon]={medianMs:+timings[25].toFixed(3),p95Ms:+timings[47].toFixed(3),meshRaycastsPerShot:raycasts/50,fullSceneUpdatesPerShot:fullSceneUpdates/50};
 }
 game.dispose();return results;
}
const before=bench(Before),after=bench(After);THREE.Mesh.prototype.raycast=originalRaycast;
for(const weapon of ['pistol','shotgun']){
 assert(after[weapon].meshRaycastsPerShot<before[weapon].meshRaycastsPerShot);
 assert.equal(after[weapon].fullSceneUpdatesPerShot,0);
}
// The optimized body retains all source hit surfaces and limb articulation.
for(const type of ['walker','runner','brute']){
 const old=fixture(Before),next=fixture(After);const a=old.game.createZombie(type,0,-10),b=next.game.createZombie(type,0,-10);
 const visibleMeshes=root=>{let count=0;root.traverseVisible(o=>{if(o instanceof THREE.Mesh)count++});return count};
 assert.equal(visibleMeshes(b.root),visibleMeshes(a.root)-2);
 const rays=[new THREE.Raycaster(new THREE.Vector3(0,1.7,0),new THREE.Vector3(0,0,-1)),new THREE.Raycaster(new THREE.Vector3(0,1.1,0),new THREE.Vector3(0,0,-1))];
 a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);
 for(const r of rays){const h1=r.intersectObject(a.root,true)[0],h2=r.intersectObjects(index.prepare([b.root]),false)[0];assert(h1&&h2);assert(Math.abs(h1.distance-h2.distance)<1e-8);assert.equal(h2.object.userData.survivalHead===true,h1.object.userData.survivalHead===true);}
 b.leftArm.rotation.x=1;index.prepare([b.root]);assert.equal(b.leftArm.rotation.x,1);
 old.game.dispose();next.game.dispose();
}
console.log(JSON.stringify({before,after},null,2));
console.log('PASS: exact cover hits, hidden source hits, current moving doors, no full-scene shot updates, fewer duplicate raycasts, 25% fewer zombie meshes, preserved headshots/limbs');
