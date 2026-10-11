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
  './shot-targets': await module('shot-targets'),
  './zombie-body': await module('zombie-body'),
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
for (const weapon of ['pistol', 'rifle', 'shotgun']) for (const aimed of [false, true]) {
  game.weapon = weapon; game.aimActive = aimed; game.fireCooldown = 0;
  const paths = []; game.spawnTracer = (from,to)=>paths.push({from:from.clone(),to:to.clone()});
  game.fire();
  const muzzle = game.weaponRigs.get(weapon).muzzleFlash.getWorldPosition(new THREE.Vector3());
  assert.equal(paths.length, weapon === 'shotgun' ? 8 : 1); checks++;
  for (const path of paths) { assert.ok(path.from.distanceTo(muzzle)<1e-8); assert.ok(path.to.distanceTo(path.from)>1); checks+=2; }
  if (aimed && weapon !== 'shotgun') { assert.ok(Math.abs(paths[0].to.x-camera.position.x)<1e-8); checks++; }
  if (weapon==='shotgun') { assert.ok(paths.some(path=>path.to.distanceTo(paths[0].to)>.01)); checks++; }
}
console.log(`${checks} muzzle-origin, aim endpoint and shotgun spread checks passed`);
