// Exercise production effect ownership, reuse and lifecycle without a browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
const source = await readFile(new URL('../src/combat-effects.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace("from 'three'", `from '${import.meta.resolve('three')}'`);
const { CombatEffects } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const scene = new THREE.Scene(), unrelated = new THREE.Group(); scene.add(unrelated);
const effects = new CombatEffects(scene), from = new THREE.Vector3(1, 2, 3), to = new THREE.Vector3(4, 5, 6);
let checks = 0; const check = (value, label) => { assert.ok(value, label); checks++; };
for (let i = 0; i < 8; i++) { effects.tracer(from, to); effects.impact(to, i % 2 === 0); }
check(effects.tracerCount === 8 && effects.impactCount === 8, 'complete shotgun burst');
const objects = scene.children.filter(o => o !== unrelated);
const resources = new Set(objects.flatMap(o => [o.geometry, o.material]));
let disposals = 0; resources.forEach(r => r.addEventListener('dispose', () => disposals++));
check(objects.filter(o => o.isLine).every(o => Array.from(o.geometry.attributes.position.array).join() === '1,2,3,4,5,6'), 'tracer endpoints');
check(objects.filter(o => o.isMesh).some(o => o.scale.x === .075 && o.material.color.getHex() === 0x9e302d), 'blood impact appearance');
check(objects.filter(o => o.isMesh).some(o => o.scale.x === .045 && o.material.color.getHex() === 0xffc66d), 'wall impact appearance');
effects.update(.06); check(effects.tracerCount === 0 && effects.impactCount === 8, 'independent effect lifetimes');
effects.update(.08); check(scene.children.length === 1, 'expired effects leave scene');
for (let burst = 0; burst < 300; burst++) {
  for (let i = 0; i < 8; i++) { effects.tracer(to, from); effects.impact(from, false); }
  check(scene.children.filter(o => o !== unrelated).every(o => objects.includes(o)), 'warm burst reuses objects');
  effects.update(.14);
}
check(disposals === 0, 'no disposal between shots');
effects.impact(from, true); effects.update(.04); effects.impact(to, false);
const impacts = scene.children.filter(o => o.isMesh);
check(impacts[0].material.opacity !== impacts[1].material.opacity, 'independent fades');
effects.clear(); check(scene.children.length === 1 && effects.impactCount === 0, 'clear releases effects');
effects.impact(to, false); check(scene.children.find(o => o.isMesh).material.opacity === .9, 'reuse resets fade');
for (let i = 0; i < 100; i++) { effects.tracer(from, to); effects.impact(to, true); }
check(effects.tracerCount === 32 && effects.impactCount === 32, 'overlapping cosmetics bounded');
const allResources = new Set(scene.children.filter(o => o !== unrelated).flatMap(o => [o.geometry, o.material]));
const counts = new Map(); allResources.forEach(r => r.addEventListener('dispose', () => counts.set(r, (counts.get(r) || 0) + 1)));
effects.dispose(); effects.dispose(); effects.tracer(from, to); effects.impact(to, true);
check(scene.children.length === 1 && scene.children[0] === unrelated, 'dispose preserves unrelated scene objects');
check([...allResources].every(r => counts.get(r) === 1), 'owned resources disposed exactly once');
console.log(`${checks} combat effect checks passed`);
