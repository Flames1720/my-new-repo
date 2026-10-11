// Run: node tools/performance_regression.mjs
// Exercise the real TypeScript helpers without adding a test framework.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

async function sourceModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const resolved = output.replace(/from '(three[^']*)'/g, (_, name) => `from '${import.meta.resolve(name)}'`);
  return import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);
}
const { compactStaticResource } = await sourceModule('../src/static-meshes.ts');
const { instanceChunkResources } = await sourceModule('../src/resource-instances.ts');
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
const close = (a, b) => Math.abs(a - b) < 1e-5;
const geometry = new THREE.BoxGeometry(1, 2, 1);
const material = new THREE.MeshBasicMaterial();
const chunk = new THREE.Group();
chunk.position.set(7, 0, 3);
const resources = [0, 3].map((x, index) => {
  const root = new THREE.Group();
  root.name = `tree-${index}`;
  root.userData.resource = { hits: 3 };
  root.userData.colliderRadius = 0.7;
  root.position.set(x, 0, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 1;
  root.add(mesh);
  chunk.add(root);
  return root;
});
chunk.updateMatrixWorld(true);
const ray = new THREE.Raycaster(new THREE.Vector3(7, 1, 8), new THREE.Vector3(0, 0, -1));
const before = ray.intersectObjects(resources, true)[0];
instanceChunkResources(chunk, g => g === geometry);
const batch = chunk.children.find(o => o instanceof THREE.InstancedMesh);
check(batch?.count === 2, 'two repeated parts use one instanced draw');
check(resources.every(r => r.visible && !r.children[0].visible), 'only source render meshes are hidden');
check(resources.every(r => r.userData.colliderRadius === 0.7 && r.userData.resource.hits === 3), 'resource identity/colliders stay intact');
const after = ray.intersectObjects(resources, true)[0];
check(after.object === before.object && close(after.distance, before.distance), 'exact ray hits survive instancing');
check(ray.intersectObject(batch).length === 0, 'batch does not produce anonymous duplicate hits');
resources[0].scale.setScalar(0.8);
resources[0].userData.syncInstances();
const matrix = new THREE.Matrix4();
batch.getMatrixAt(0, matrix);
check(close(matrix.elements[0], 0.8) && close(matrix.elements[13], 0.8), 'harvest shrink updates rendered scale and local offset');
const second = new THREE.Matrix4();
batch.getMatrixAt(1, second);
resources[0].userData.removeInstances();
batch.getMatrixAt(0, matrix);
check(matrix.elements[0] === 0 && matrix.elements[5] === 0 && matrix.elements[10] === 0, 'harvest removes only its rendered slot');
batch.getMatrixAt(1, matrix);
check(matrix.equals(second), 'other resource instance remains unchanged');
check(!resources[0].userData.syncInstances && !resources[0].userData.removeInstances, 'removed resource callbacks release bindings');

const combined = new THREE.Group();
combined.position.set(2, 0, 0);
const originals = [0, 2].map(x => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  mesh.position.set(x, 1, 0);
  mesh.rotation.y = 0.3;
  combined.add(mesh);
  return mesh.geometry;
});
let disposed = 0;
originals.forEach(g => g.addEventListener('dispose', () => disposed++));
combined.updateMatrixWorld(true);
const mergeRay = new THREE.Raycaster(new THREE.Vector3(2, 1, 5), new THREE.Vector3(0, 0, -1));
const mergeHit = mergeRay.intersectObject(combined, true)[0];
compactStaticResource(combined);
combined.updateMatrixWorld(true);
check(combined.children.length === 1, 'opaque matching resource parts merge');
check(disposed === 2, 'replaced owned geometries are disposed');
check(close(mergeRay.intersectObject(combined, true)[0].distance, mergeHit.distance), 'merging preserves translated/rotated hit geometry');
check(combined.children[0].matrixAutoUpdate === false && combined.matrixAutoUpdate, 'static parts stay fixed while resource parent can move');

const shared = new THREE.Group();
let sharedDisposed = 0;
geometry.addEventListener('dispose', () => sharedDisposed++);
shared.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
compactStaticResource(shared, g => g === geometry);
check(sharedDisposed === 0, 'shared template geometry remains live');
const transparent = new THREE.Group();
const glass = new THREE.MeshBasicMaterial({ transparent: true });
transparent.add(new THREE.Mesh(geometry, glass), new THREE.Mesh(geometry, glass));
compactStaticResource(transparent);
instanceChunkResources(transparent, () => true);
check(transparent.children.length === 2, 'transparent objects retain their sorting/individual meshes');
// Exercise the actual Chunks class with controlled dry terrain, so cancellation
// and atomic publication are deterministic and independent of GPU/CDN timing.
const mainSource = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const classSource = mainSource.slice(mainSource.indexOf('class Chunks {'), mainSource.indexOf('\nconst chunks = new Chunks();'));
check(classSource.startsWith('class Chunks {'), 'streaming test loads the production class');
const classCode = ts.transpileModule(classSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const terrainMaterial = new THREE.MeshBasicMaterial();
const world = new THREE.Group();
let releases = 0;
const makeResource = () => { const group = new THREE.Group(); group.add(new THREE.Mesh(geometry, material)); return group; };
const dependencies = {
  THREE, SIZE: 16, WORLD_RADIUS: 2, LOW_POWER_MODE: true,
  settings: { current: { chunkRadius: 1, lodDetail: 'balanced' } },
  voxelWorld: { chunk: () => ({}) }, terrainHeightAt: () => 0,
  waterDepthAt: () => 0, waterAt: () => false, waterSurfaceAt: () => 0,
  waterFlowAt: () => ({ waterType: 'dry' }), biomeAt: () => 'forest',
  terrainColorAt: () => new THREE.Color(0x557755), clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  ROAD_SPACING: 100, ROAD_WIDTH: 4, sharedRoadMaterial: material, terrainMaterial,
  sharedStumpGeometry: geometry, sharedStumpMaterial: material,
  sharedRubbleGeometry: geometry, sharedRubbleMaterial: material,
  isBridgeAt: () => false, nearHome: () => false, nearVillage: () => false,
  roadAt: () => false, hash: () => 0.6, mountainMaskAt: () => 0,
  pickTreeKind: () => 'oak', RESOURCE_DEFS: { oak: { hitsToFell: 3, colliderRadius: 0.7, regrowSeconds: 180 } },
  buildTree: makeResource, buildRock: makeResource, buildHome: () => new THREE.Group(),
  buildVillage: () => {}, VILLAGE_X: 1000, VILLAGE_Z: 1000,
  environmentAssets: { isSharedGeometry: g => g === geometry }, sharedWorldGeometries: new Set(),
  instanceChunkResources, world, player: { root: new THREE.Group() },
  disposeWorldObjects: () => { releases++; }, aimCache: null, aimTimer: 0,
};
const Chunks = new Function(...Object.keys(dependencies), `${classCode}\nreturn Chunks;`)(...Object.values(dependencies));
const chunks = new Chunks();
function drain() {
  let steps = 0;
  while (chunks.pendingBuilds && steps++ < 10000) chunks.pumpBuilds(0);
  check(chunks.pendingBuilds === 0, 'queued work drains through cooperative slices');
}
chunks.build(0, 0, 1);
const oldChunk = chunks.loaded.get('0,0');
chunks.streamQueued(0, 0);
chunks.pumpBuilds(0);
check(chunks.loaded.get('0,0') === oldChunk, 'old chunk remains during a partial upgrade');
check(chunks.activeBuild !== null, 'chunk construction yields before publishing');
chunks.changes['0,0'] = ['tree-0@' + Date.now()];
drain();
check(chunks.loaded.get('0,0') !== oldChunk, 'finished upgrade replaces the old chunk');
check(!chunks.loaded.get('0,0').getObjectByName('tree-0'), 'edit made during construction is preserved after retry');
check(chunks.loaded.size === 9 && world.children.length === 9, 'no partial/duplicate chunks publish');
chunks.refreshAssets();
chunks.pumpBuilds(0);
const releasesBefore = releases;
chunks.streamQueued(16, 0);
check(releases > releasesBefore, 'requeue cancels and releases partial owned geometry');
drain();
check([...chunks.loaded.values()].every(g => g.userData.assetRevision === 1), 'late asset refresh reaches the current chunk window');
check([...chunks.loaded.keys()].every(key => { const [x,z] = key.split(',').map(Number); return Math.abs(x-1)<=1 && Math.abs(z)<=1; }), 'movement cannot publish obsolete out-of-range work');
chunks.refreshAssets(); chunks.pumpBuilds(0); chunks.stream(0,0);
check(chunks.activeBuild === null && chunks.pendingBuilds === 0, 'synchronous restart cancels incremental work');
console.log(`${checks} performance regression checks passed`);
