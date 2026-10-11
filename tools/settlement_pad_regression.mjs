import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
let code=ts.transpileModule(await readFile('src/world.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replaceAll("from 'three'",`from '${import.meta.resolve('three')}'`);
const world=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
for(const [x,z,r] of [[world.HOME_X,world.HOME_Z,9],[world.VILLAGE_X,world.VILLAGE_Z,13]]) {
 const h=world.terrainHeightAt(x,z);
 for(let dx=-r;dx<=r;dx+=.5) for(let dz=-r;dz<=r;dz+=.5) if(Math.hypot(dx,dz)<=r) {
  assert(Math.abs(world.terrainHeightAt(x+dx,z+dz)-h)<1e-8,'Flat building floor clearance');
  assert(!world.waterAt(x+dx,z+dz),'Building pads stay dry');
 }
}
assert(world.insideBuildingFootprint(world.HOME_X,world.HOME_Z));
for(const [dx,dz] of [[-6,-5],[7,-4],[1,7]]) assert(world.insideBuildingFootprint(world.VILLAGE_X+dx,world.VILLAGE_Z+dz));
assert(!world.insideBuildingFootprint(100,100));
console.log('PASS: flat dry raised home/village pads and indoor spawn bounds');
