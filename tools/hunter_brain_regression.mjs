import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const code=ts.transpileModule(await readFile('src/hunter-brain.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {HunterBrain}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const observation={dt:.12,x:0,z:0,playerX:15,playerZ:0,visible:true,aimedAt:false,shotVisible:false,reloadAudible:false,hpFraction:1,canMove:()=>true,covered:()=>false};
const hunter=new HunterBrain();hunter.update(observation);assert.equal(hunter.tactic,'flank');assert.notEqual(hunter.targetZ,0);
hunter.update({...observation,reloadAudible:true});assert.equal(hunter.tactic,'rush');assert(Math.abs(hunter.targetZ)<.001);
hunter.update({...observation,aimedAt:true,shotVisible:true});assert.equal(hunter.tactic,'dodge');assert.equal(hunter.speed,7);assert(Math.abs(hunter.targetZ)>1);
for(let i=0;i<12;i++)hunter.update({...observation,visible:false,playerX:1000,playerZ:1000});
assert(Math.hypot(hunter.targetX,hunter.targetZ)<20,'cannot track unseen teleport');
for(let i=0;i<50;i++)hunter.update({...observation,visible:false});assert.equal(hunter.tactic,'search');assert(Math.hypot(hunter.targetX,hunter.targetZ)<=3.01);
const blocked=new HunterBrain();blocked.update({...observation,canMove:()=>false});assert.equal(blocked.speed,0);
const cover=new HunterBrain();cover.update({...observation,hpFraction:.3,covered:(x,z)=>z<0});assert(cover.targetZ<0,'wounded hunter prefers cover');
const ambush=new HunterBrain();for(let i=0;i<12;i++)ambush.update({...observation,playerZ:i*.4});ambush.update({...observation,playerZ:4.8,reloadAudible:true});assert.equal(ambush.tactic,'rush');assert(ambush.targetZ>0,'intercepts observed movement');
ambush.attacked();ambush.update({...observation});assert.equal(ambush.tactic,'recover');
console.log('PASS: flank, reload rush, aim dodge, cover, interception, attack recovery, obstacle refusal and bounded visual memory');

const hearing=new HunterBrain();hearing.update({...observation,visible:false,noiseAudible:true,playerX:10.5,playerZ:1.8});assert.equal(hearing.tactic,'search');assert(hearing.targetX>0);
let coverQueries=0;const budget=new HunterBrain();budget.update({...observation,hpFraction:.3,covered:()=>{coverQueries++;return false;}});assert(coverQueries<=3);
console.log('PASS: footsteps yield approximate search area; cover-query work is capped');

const arrival=new HunterBrain();arrival.investigate(15,0);arrival.update({...observation,visible:false,playerX:1000,playerZ:1000});assert(arrival.targetX>0&&arrival.targetX<20);console.log('PASS: arrival clue starts pursuit without following hidden player movement');
