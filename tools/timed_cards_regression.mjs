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
game.enabled=true;
let checks=0;
const healed=[];game.options.onHealing=amount=>healed.push(amount);
game.health=20;assert(game.activateMedic());assert.equal(game.health,20);checks+=2;
assert.equal(game.activateMedic(),false);checks++;
game.updateCardFields(.5);assert.equal(game.health,20);checks++;
game.updateCardFields(.5);assert.equal(game.health,23);checks++;
for(let i=0;i<110;i++)game.updateCardFields(.1);
assert.equal(game.health,56);assert.equal(healed.length,12);assert(healed.every(n=>n===3));assert.equal(game.medicRemaining,0);checks+=4;
game.restart();game.health=99;assert(game.activateMedic());game.updateCardFields(12);assert.equal(game.health,100);checks+=2;
game.restart();game.health=1;assert(game.activateMedic());game.medicBeat=.99;
const attacker=game.createZombie('walker',camera.position.x+.5,camera.position.z);attacker.lastAttack=-100;game.zombies.push(attacker);
game.update(.02,false,false);assert(game.isDead);assert.equal(game.health,0);assert.equal(game.medicRemaining,0);assert.equal(game.activateMedic(),false);checks+=5;
game.restart();const walker=game.createZombie('walker',camera.position.x+3,camera.position.z);const boss=game.createZombie('brute',camera.position.x+4,camera.position.z,2);game.zombies.push(walker,boss);
const hp=walker.hp;assert(game.activateSkill());assert.equal(game.activateSkill(),false);assert(walker.position.x>camera.position.x+5);assert.equal(walker.hp,hp);checks+=4;
const field=game.cardFields;const afterFirst=walker.position.x;game.updateCardFields(.75);assert(walker.position.x>afterFirst);checks++;
const beforeBoss=boss.position.x;game.updateZombie(boss,.1,camera.position,false);const slowedStep=beforeBoss-boss.position.x;
game.pulseRemaining=0;const beforeNormal=boss.position.x;game.updateZombie(boss,.1,camera.position,false);const normalStep=beforeNormal-boss.position.x;
assert(Math.abs(slowedStep/normalStep-.45)<1e-6);checks++;
game.zombies.forEach(actor=>game.removeZombie(actor));game.update(18,false,false);assert(game.activateSkill());assert.equal(game.cardFields,field);checks+=2;
game.updateCardFields(6);assert.equal(game.pulseRemaining,0);assert.equal(game.cardFields.children[0].visible,false);checks+=2;
game.skillCooldown=0;game.health=30;game.medicCooldown=0;game.activateSkill();game.activateMedic();game.setEnabled(false);assert.equal(game.pulseRemaining,0);assert.equal(game.medicRemaining,0);assert(game.cardFields.children.every(ring=>!ring.visible));checks+=3;
game.setEnabled(true);game.restart();assert.equal(game.medicCooldown,0);assert.equal(game.skillCooldown,0);checks+=2;
console.log(`${checks} timed Pulse/Medic, lethal-hit, cooldown, expiry and reused-field checks passed`);
game.dispose();
