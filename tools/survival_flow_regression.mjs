// Exercise the real firing controller and weapon geometry; audio is stubbed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
const data = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
async function module(name, dependencies = {}) {
  let code = ts.transpileModule(await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  dependencies.three = import.meta.resolve('three');
  for (const [key, value] of Object.entries(dependencies)) code = code.replaceAll(`from '${key}'`, `from '${value}'`);
  return data(code);
}
const weapons = await module('survival-weapons');
const effects = await module('combat-effects');
const controller = await module('zombie-survival', {
  './terrain': data('export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));'),
  './survival-weapons': weapons,
  './combat-effects': effects,
  './survival-audio': data('export const survivalSound=new Proxy({}, {get:()=>()=>{}});'),
  './settings': data('export const settings={current:{audioMaster:1,audioSfx:1}};'),
});
const { ZombieSurvivalSystem } = await import(controller);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(65, 2, .1, 200);
camera.position.set(3, 2, 4); scene.add(camera);
const game = new ZombieSurvivalSystem({ scene, camera, getPlayerPosition:()=>camera.position, getTerrainHeight:()=>0, isWater:()=>false, getWaterDepth:()=>0, canOccupy:()=>true, getSightBlockers:()=>[], safeZones:[], lowPowerMode:true, respawnPlayer:()=>{}, notify:()=>{}, onStatus:()=>{}, onDamage:()=>{}, onDeath:()=>{} });
game.enabled = true;
let checks = 0;
for (const weapon of ['pistol','rifle','shotgun']) {
  game.weapon=weapon;game.reloadTimer=0;game.fireCooldown=0;game.ammo[weapon]={mag:1,reserve:30};
  game.fire();assert.equal(game.ammo[weapon].mag,0);assert.ok(game.reloadTimer>0);checks+=2;
  const reserve=game.ammo[weapon].reserve;game.finishReload();assert.ok(game.ammo[weapon].mag>0);assert.equal(game.ammo[weapon].mag+game.ammo[weapon].reserve,reserve);checks+=2;
  game.reloadTimer=0;game.fireCooldown=0;game.ammo[weapon]={mag:0,reserve:9};game.fire();assert.ok(game.reloadTimer>0);checks++;
  game.reloadTimer=0;game.fireCooldown=0;game.ammo[weapon]={mag:0,reserve:0};game.fire();assert.equal(game.reloadTimer,0);checks++;
  game.reloadTimer=0;game.fireCooldown=0;game.ammo[weapon]={mag:0,reserve:9};game.fireHeld=true;game.update(.016,false,false);assert.ok(game.reloadTimer>0);checks++;game.fireHeld=false;
}
game.fireHeld=false;game.weapon='pistol';game.reloadTimer=0;game.ammo.pistol={mag:0,reserve:10};
game.reload();const normalReload=game.reloadTimer;game.reloadTimer=0;
assert(game.activateFieldEffect('quick-hands'));game.reload();assert.equal(game.reloadTimer,normalReload*.6);checks+=2;
for(const id of ['steady-grip','reinforced-vest','sharpshooter','scavenger']){assert(game.activateFieldEffect(id));assert(game.fieldEffects[id]>0);checks+=2;}
game.fieldEffects['quick-hands']=.01;game.update(.02,false,false);assert.equal(game.fieldEffects['quick-hands'],0);checks++;
game.previousTravelPosition=null;game.distanceMeters=0;game.update(.016,false,false);camera.position.x+=.2;game.update(.016,false,false);assert(Math.abs(game.distanceMeters-.2)<1e-8);checks++;
camera.position.x+=100;game.update(.016,false,false);assert(Math.abs(game.distanceMeters-.2)<1e-8);checks++;
game.health=100;game.fieldEffects['reinforced-vest']=8;game.damagePlayer(20);assert.equal(game.health,87);checks++;
game.fieldEffects['reinforced-vest']=0;game.damagePlayer(20);assert.equal(game.health,67);checks++;
const boss=game.createZombie('walker',camera.position.x+5,camera.position.z,1);game.damageZombie(boss,100000,false);assert.equal(game.bossKills,1);game.damageZombie(boss,100000,false);assert.equal(game.bossKills,1);checks+=2;
const originalWet=game.options.isWater;game.options.isWater=()=>true;camera.position.x+=.2;game.update(.016,false,false);assert(Math.abs(game.distanceMeters-.2)<1e-8);checks++;game.options.isWater=originalWet;
game.bossKills=3;game.restart();assert.equal(game.bossKills,0);assert.equal(game.distanceMeters,0);assert.equal(game.elapsed,0);assert.deepEqual(game.fieldEffects,{});checks+=4;
const {findSanctuarySites}=await import(await module('sanctuary-sites'));
const world=await import(await module('world'));
const sites=findSanctuarySites({originX:world.HOME_X,originZ:world.HOME_Z,limit:world.WORLD_RADIUS*world.SIZE,height:world.terrainHeightAt,wet:world.waterAt,buildingDistrict:(x,z)=>Math.hypot(x-world.HOME_X,z-world.HOME_Z)<30||Math.hypot(x-world.VILLAGE_X,z-world.VILLAGE_Z)<45});
assert.equal(sites.length,8);checks++;
for(const site of sites)for(let dx=-10;dx<=10;dx+=2)for(let dz=-10;dz<=10;dz+=2){if(dx*dx+dz*dz>100)continue;assert.equal(world.waterAt(site.x+dx,site.z+dz),false);assert.ok(Math.hypot(site.x+dx-world.HOME_X,site.z+dz-world.HOME_Z)>=30);assert.ok(Math.hypot(site.x+dx-world.VILLAGE_X,site.z+dz-world.VILLAGE_Z)>=45);checks+=3;}
assert.deepEqual(findSanctuarySites({originX:0,originZ:0,limit:100,height:()=>0,wet:()=>true,buildingDistrict:()=>false}),[]);checks++;
console.log(`${checks} auto-reload and real-terrain dry sanctuary checks passed; ${sites.length} clearings`);

game.options.canSpawnAt=()=>false;game.zombies=[];game.spawnZombie();assert.equal(game.zombies.length,0);
game.options.canSpawnAt=()=>true;game.spawnZombie();assert.equal(game.zombies.length,1);
console.log("PASS: actual spawn controller respects building exclusion");
