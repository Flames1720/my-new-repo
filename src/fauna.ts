import * as THREE from 'three';
import type { Biome, Species, Mood, Gender, AnimalMarker, AnimalState, BuiltAnimal } from './types';
import { clamp, lerp, SEED, WATER_LEVEL } from './terrain';
import { queryWorldFields, isRiverAt, riverDistanceAt, defaultWorldModel, WorldModel } from './world';

export interface WildlifeOptions {
  heightAt: (x: number, z: number) => number;
  waterAt: (x: number, z: number) => boolean;
  roadAt: (x: number, z: number) => boolean;
  nearHome: (x: number, z: number) => boolean;
  biomeAt: (x: number, z: number) => Biome;
  chunkSize: number;
  trust: Record<string, number>;
  hasFruit: () => boolean;
  consumeFruit: () => void;
  onTrustChange: () => void;
  notify: (message: string) => void;
  faunaContainer?: THREE.Group;
  worldModel?: WorldModel;
}

export const SPECIES_NAME: Record<Species, string> = {
  deer: 'White-tailed deer',
  rabbit: 'Cottontail rabbit',
  fox: 'Red fox',
  wolf: 'Grey wolf',
  boar: 'Wild boar',
  duck: 'Mallard duck',
  cow: 'Pasture cow',
};

export const SPECIES_COLOR: Record<Species, number> = {
  deer: 0xb57f4e,
  rabbit: 0xb2a18e,
  fox: 0xd95f26,
  wolf: 0x6e7680,
  boar: 0x473932,
  duck: 0x2b6343,
  cow: 0xe6e1da,
};

export const SPECIES_ICON: Record<Species, string> = {
  deer: '🦌',
  rabbit: '🐇',
  fox: '🦊',
  wolf: '🐺',
  boar: '🐗',
  duck: '🦆',
  cow: '🐄',
};

export const speciesColor = (s: Species): string => '#' + (SPECIES_COLOR[s] || 0x888888).toString(16).padStart(6, '0');

// Strict Ecological Trophic Limits: Small predator packs and flourishing prey
export const MAX_SPECIES_CAP: Record<Species, number> = {
  wolf: 2,   // Controlled apex pack (Max 2 in world)
  fox: 3,    // Controlled woodland predator (Max 3 in world)
  boar: 20,
  deer: 36,
  cow: 26,
  duck: 36,
  rabbit: 48,
};

const PREDATORS = new Set<Species>(['wolf', 'fox']);
const HERD_ANIMALS = new Set<Species>(['cow', 'deer', 'duck']);

export const DUCK_WATER_OFFSET = 0.16;

// Shared Geometries & Materials Cache
const MAT = new Map<number, THREE.MeshStandardMaterial>();
const GEO = {
  body: new THREE.SphereGeometry(1, 12, 9),
  head: new THREE.SphereGeometry(1, 11, 9),
  leg: new THREE.CapsuleGeometry(0.08, 0.42, 3, 6),
  ear: new THREE.ConeGeometry(0.12, 0.48, 5),
  horn: new THREE.CylinderGeometry(0.022, 0.065, 0.52, 5),
  cowHorn: new THREE.ConeGeometry(0.07, 0.38, 6),
  muzzle: new THREE.SphereGeometry(1, 9, 7),
  tail: new THREE.ConeGeometry(0.18, 0.72, 6),
  wing: new THREE.BoxGeometry(0.35, 0.06, 0.65),
  eye: new THREE.SphereGeometry(0.045, 7, 6),
  highlight: new THREE.SphereGeometry(0.016, 4, 3),
  box: new THREE.BoxGeometry(1, 1, 1),
};

export const SHARED_ANIMAL_ASSETS = new Set<THREE.BufferGeometry | THREE.Material>(Object.values(GEO));

export function isSharedAnimalAsset(asset: THREE.BufferGeometry | THREE.Material): boolean {
  return SHARED_ANIMAL_ASSETS.has(asset);
}

const mat = (color: number, roughness = 0.85, metalness = 0.05) => {
  let m = MAT.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
    MAT.set(color, m);
    SHARED_ANIMAL_ASSETS.add(m);
  }
  return m;
};

function seeded(a: number, b: number): number {
  let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ SEED;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  parent: THREE.Object3D,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1]
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position);
  m.scale.set(...scale);
  parent.add(m);
  return m;
}

// --- ANATOMICAL MODEL BUILDERS WITH GENDERS & DETAILED SKELETAL RIGGING ---

function buildDeerModel(gender: Gender, isBaby: boolean): BuiltAnimal {
  const root = new THREE.Group();
  root.name = isBaby ? 'deer-fawn' : gender === 'male' ? 'deer-stag' : 'deer-doe';
  const scale = isBaby ? 0.52 : gender === 'male' ? 1.05 : 0.95;

  const stagCoat = 0xa36838, doeCoat = 0xb87844, fawnCoat = 0xc78a52;
  const fur = mat(isBaby ? fawnCoat : gender === 'male' ? stagCoat : doeCoat, 0.88);
  const bellyWhite = mat(0xf7eedb, 0.85);
  const hoofBlack = mat(0x23211f, 0.6);
  const antlerBone = mat(0xe6dac4, 0.9);
  const noseBlack = mat(0x181817, 0.4);
  const eyeBlack = mat(0x111111, 0.2);
  const eyeHighlight = mat(0xffffff, 0.2);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  mesh(GEO.body, fur, body, [0, 0.82 * scale, 0], [0.85 * scale, 0.62 * scale, 1.25 * scale]);
  mesh(GEO.body, bellyWhite, body, [0, 0.72 * scale, 0.15 * scale], [0.65 * scale, 0.45 * scale, 0.9 * scale]);

  const neck = mesh(GEO.body, fur, body, [0, 1.22 * scale, 0.52 * scale], [0.32 * scale, 0.68 * scale, 0.36 * scale]);
  neck.rotation.x = -0.42;

  if (isBaby) {
    for (let s = -2; s <= 2; s++) {
      mesh(GEO.highlight, bellyWhite, body, [0.22 * scale, (0.95 + Math.abs(s) * 0.04) * scale, s * 0.2 * scale], [1.6, 1.6, 1.6]);
      mesh(GEO.highlight, bellyWhite, body, [-0.22 * scale, (0.95 + Math.abs(s) * 0.04) * scale, s * 0.2 * scale], [1.6, 1.6, 1.6]);
    }
  }

  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 1.48 * scale, 0.82 * scale);
  body.add(head);

  mesh(GEO.head, fur, head, [0, 0, 0], [0.26 * scale, 0.28 * scale, 0.36 * scale]);
  mesh(GEO.muzzle, bellyWhite, head, [0, -0.06 * scale, 0.32 * scale], [0.18 * scale, 0.16 * scale, 0.28 * scale]);
  mesh(GEO.muzzle, noseBlack, head, [0, -0.04 * scale, 0.44 * scale], [0.09 * scale, 0.07 * scale, 0.1 * scale]);

  for (const side of [-1, 1]) {
    mesh(GEO.eye, bellyWhite, head, [side * 0.14 * scale, 0.07 * scale, 0.22 * scale], [1.3, 1.3, 1.3]);
    const eye = mesh(GEO.eye, eyeBlack, head, [side * 0.145 * scale, 0.07 * scale, 0.23 * scale], [1, 1, 1]);
    mesh(GEO.highlight, eyeHighlight, eye, [side * 0.015, 0.015, 0.035], [1, 1, 1]);
  }

  for (const side of [-1, 1]) {
    const ear = mesh(GEO.ear, fur, head, [side * 0.16 * scale, 0.26 * scale, -0.04 * scale], [0.8 * scale, 1.35 * scale, 0.5 * scale]);
    ear.rotation.z = -side * 0.55;
    ear.rotation.x = -0.22;
  }

  // Branching Antlers for Stags
  if (gender === 'male' && !isBaby) {
    for (const side of [-1, 1]) {
      const beam = mesh(GEO.horn, antlerBone, head, [side * 0.12 * scale, 0.32 * scale, 0.05 * scale], [1.1 * scale, 1.25 * scale, 1.1 * scale]);
      beam.rotation.z = -side * 0.45;
      beam.rotation.x = -0.35;

      const tine1 = mesh(GEO.horn, antlerBone, beam, [side * 0.08, 0.22, 0.05], [0.7, 0.65, 0.7]);
      tine1.rotation.z = -side * 0.65;

      const tine2 = mesh(GEO.horn, antlerBone, beam, [0, 0.38, -0.08], [0.65, 0.6, 0.65]);
      tine2.rotation.x = -0.65;
    }
  }

  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.95 * scale, -0.65 * scale);
  body.add(tail);
  const tailMesh = mesh(GEO.tail, fur, tail, [0, -0.15 * scale, -0.08 * scale], [0.45 * scale, 0.65 * scale, 0.45 * scale]);
  mesh(GEO.tail, bellyWhite, tailMesh, [0, 0.02, 0.02], [0.95, 0.95, 0.95]);

  const legs: THREE.Group[] = [];
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.42, 0.38]) {
      const pivot = new THREE.Group();
      pivot.position.set(x * scale, 0.55 * scale, z * scale);
      body.add(pivot);

      const upper = mesh(GEO.leg, fur, pivot, [0, -0.25 * scale, 0], [0.85 * scale, 1.05 * scale, 0.85 * scale]);
      upper.position.y = -0.25 * scale;
      mesh(GEO.muzzle, hoofBlack, pivot, [0, -0.55 * scale, 0.02 * scale], [0.12 * scale, 0.08 * scale, 0.16 * scale]);
      legs.push(pivot);
    }
  }

  root.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { root, body, legs, head, tail };
}

function buildCowModel(gender: Gender, isBaby: boolean): BuiltAnimal {
  const root = new THREE.Group();
  root.name = isBaby ? 'cow-calf' : gender === 'male' ? 'pasture-bull' : 'pasture-cow';
  const scale = isBaby ? 0.55 : gender === 'male' ? 1.15 : 1.0;

  const coatWhite = mat(0xf2f0eb, 0.88);
  const coatBlack = mat(0x242426, 0.85);
  const muzzlePink = mat(0xe8b8aa, 0.65);
  const hornIvory = mat(0xd9cfbc, 0.75);
  const hoofDark = mat(0x2a2826, 0.6);
  const eyeDark = mat(0x181819, 0.2);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  mesh(GEO.body, coatWhite, body, [0, 0.88 * scale, 0], [1.15 * scale, 0.92 * scale, 1.65 * scale]);
  mesh(GEO.body, coatBlack, body, [0.35 * scale, 1.05 * scale, 0.2 * scale], [0.7 * scale, 0.6 * scale, 0.8 * scale]);
  mesh(GEO.body, coatBlack, body, [-0.4 * scale, 0.95 * scale, -0.3 * scale], [0.65 * scale, 0.55 * scale, 0.75 * scale]);

  if (gender === 'male' && !isBaby) {
    mesh(GEO.body, coatBlack, body, [0, 1.25 * scale, 0.45 * scale], [0.85 * scale, 0.55 * scale, 0.75 * scale]);
  }

  if (gender === 'female' && !isBaby) {
    mesh(GEO.body, muzzlePink, body, [0, 0.45 * scale, -0.35 * scale], [0.35 * scale, 0.28 * scale, 0.38 * scale]);
  }

  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 1.15 * scale, 0.95 * scale);
  body.add(head);

  mesh(GEO.head, coatWhite, head, [0, 0, 0], [0.42 * scale, 0.38 * scale, 0.46 * scale]);
  mesh(GEO.body, coatBlack, head, [0.12 * scale, 0.12 * scale, 0], [0.3 * scale, 0.28 * scale, 0.3 * scale]);
  mesh(GEO.muzzle, muzzlePink, head, [0, -0.14 * scale, 0.35 * scale], [0.35 * scale, 0.22 * scale, 0.32 * scale]);

  for (const side of [-1, 1]) {
    mesh(GEO.eye, eyeDark, head, [side * 0.24 * scale, 0.08 * scale, 0.18 * scale], [1.1, 1.1, 1.1]);
    const ear = mesh(GEO.ear, coatWhite, head, [side * 0.35 * scale, 0.12 * scale, -0.1 * scale], [0.7 * scale, 1.1 * scale, 0.5 * scale]);
    ear.rotation.z = -side * 1.15;
    ear.rotation.x = -0.25;
  }

  if (!isBaby) {
    for (const side of [-1, 1]) {
      const horn = mesh(GEO.cowHorn, hornIvory, head, [side * 0.25 * scale, 0.32 * scale, -0.06 * scale], [0.85 * scale, gender === 'male' ? 1.35 * scale : 0.95 * scale, 0.85 * scale]);
      horn.rotation.z = -side * (gender === 'male' ? 0.75 : 0.55);
      horn.rotation.x = gender === 'male' ? 0.45 : 0.2;
    }
  }

  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.88 * scale, -0.85 * scale);
  body.add(tail);
  const tailMesh = mesh(GEO.tail, coatWhite, tail, [0, -0.45 * scale, -0.08 * scale], [0.3 * scale, 1.1 * scale, 0.3 * scale]);
  mesh(GEO.body, coatBlack, tailMesh, [0, -0.55 * scale, 0], [0.38, 0.45, 0.38]);

  const legs: THREE.Group[] = [];
  for (const x of [-0.34, 0.34]) {
    for (const z of [-0.48, 0.48]) {
      const pivot = new THREE.Group();
      pivot.position.set(x * scale, 0.62 * scale, z * scale);
      body.add(pivot);

      const leg = mesh(GEO.leg, coatWhite, pivot, [0, -0.28 * scale, 0], [1.1 * scale, 1.1 * scale, 1.1 * scale]);
      leg.position.y = -0.28 * scale;
      mesh(GEO.muzzle, hoofDark, pivot, [0, -0.58 * scale, 0.04 * scale], [0.22 * scale, 0.12 * scale, 0.24 * scale]);
      legs.push(pivot);
    }
  }

  root.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { root, body, legs, head, tail };
}

function buildDuckModel(gender: Gender, isBaby: boolean): BuiltAnimal {
  const root = new THREE.Group();
  root.name = isBaby ? 'duckling' : gender === 'male' ? 'mallard-drake' : 'mallard-hen';
  const scale = isBaby ? 0.22 : 0.36;

  const drakeGreen = mat(0x195e38, 0.5);
  const henBrown = mat(0x7a5b3a, 0.88);
  const neckWhite = mat(0xf9f9f9, 0.8);
  const breastChestnut = mat(0x6e3b28, 0.85);
  const bodyGrey = mat(0x9fa4a8, 0.88);
  const billYellow = mat(0xf5b325, 0.5);
  const billHen = mat(0xc9872e, 0.6);
  const wingSpeculum = mat(0x2349a6, 0.5);
  const orangePaddles = mat(0xe87a1a, 0.6);
  const eyeDark = mat(0x111111, 0.2);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const bodyMat = isBaby ? mat(0xd4ac3d) : gender === 'male' ? bodyGrey : henBrown;
  mesh(GEO.body, bodyMat, body, [0, 0.52 * scale, 0], [0.65 * scale, 0.52 * scale, 1.05 * scale]);

  if (gender === 'male' && !isBaby) {
    mesh(GEO.body, breastChestnut, body, [0, 0.56 * scale, 0.35 * scale], [0.55 * scale, 0.48 * scale, 0.65 * scale]);
  }

  const wings: THREE.Object3D[] = [];
  if (!isBaby) {
    for (const side of [-1, 1]) {
      const wingPivot = new THREE.Group();
      wingPivot.name = `wing-${side > 0 ? 'r' : 'l'}`;
      wingPivot.position.set(side * 0.32 * scale, 0.58 * scale, 0);
      body.add(wingPivot);

      const wingMesh = mesh(GEO.wing, bodyMat, wingPivot, [side * 0.16 * scale, 0, -0.15 * scale], [0.9 * scale, 0.8 * scale, 1.1 * scale]);
      mesh(GEO.box, wingSpeculum, wingMesh, [0, 0.04, 0], [0.8, 0.5, 0.4]);
      mesh(GEO.box, neckWhite, wingMesh, [0, 0.04, -0.2], [0.8, 0.4, 0.1]);
      wings.push(wingPivot);
    }
  }

  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 0.95 * scale, 0.55 * scale);
  body.add(head);

  const headMat = isBaby ? mat(0xa8852a) : gender === 'male' ? drakeGreen : henBrown;
  mesh(GEO.head, headMat, head, [0, 0, 0], [0.24 * scale, 0.28 * scale, 0.32 * scale]);

  if (gender === 'male' && !isBaby) {
    mesh(GEO.body, neckWhite, head, [0, -0.16 * scale, 0], [0.22 * scale, 0.08 * scale, 0.24 * scale]);
  }

  mesh(GEO.muzzle, gender === 'male' ? billYellow : billHen, head, [0, -0.04 * scale, 0.34 * scale], [0.18 * scale, 0.08 * scale, 0.32 * scale]);

  for (const side of [-1, 1]) {
    mesh(GEO.eye, eyeDark, head, [side * 0.11 * scale, 0.06 * scale, 0.12 * scale], [0.9, 0.9, 0.9]);
  }

  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.62 * scale, -0.55 * scale);
  body.add(tail);
  const tailMesh = mesh(GEO.tail, bodyMat, tail, [0, 0.12 * scale, -0.18 * scale], [0.55 * scale, 0.65 * scale, 0.55 * scale]);
  tailMesh.rotation.x = -1.95;

  const legs: THREE.Group[] = [];
  for (const x of [-0.14, 0.14]) {
    const pivot = new THREE.Group();
    pivot.position.set(x * scale, 0.28 * scale, -0.08 * scale);
    body.add(pivot);

    const leg = mesh(GEO.leg, orangePaddles, pivot, [0, -0.15 * scale, 0], [0.5 * scale, 0.6 * scale, 0.5 * scale]);
    leg.position.y = -0.16 * scale;
    mesh(GEO.muzzle, orangePaddles, pivot, [0, -0.32 * scale, 0.08 * scale], [0.22 * scale, 0.04 * scale, 0.28 * scale]);
    legs.push(pivot);
  }

  root.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { root, body, legs, head, tail, wings };
}

function buildWolfModel(gender: Gender, isBaby: boolean): BuiltAnimal {
  const root = new THREE.Group();
  root.name = isBaby ? 'wolf-pup' : 'grey-wolf';
  const scale = isBaby ? 0.52 : gender === 'male' ? 1.08 : 0.98;

  const mantleGrey = mat(gender === 'male' ? 0x4d535a : 0x5a6068, 0.88);
  const darkSpine = mat(0x2f3337, 0.9);
  const throatCream = mat(0xd4d8db, 0.85);
  const noseBlack = mat(0x161618, 0.35);
  const amberEye = mat(0xe5a329, 0.2);
  const pawMat = mat(0x42464b, 0.8);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  mesh(GEO.body, mantleGrey, body, [0, 0.72 * scale, 0], [0.92 * scale, 0.68 * scale, 1.35 * scale]);
  mesh(GEO.body, darkSpine, body, [0, 0.82 * scale, -0.05 * scale], [0.65 * scale, 0.45 * scale, 1.15 * scale]);
  mesh(GEO.body, throatCream, body, [0, 0.62 * scale, 0.25 * scale], [0.68 * scale, 0.52 * scale, 0.85 * scale]);

  const ruff = mesh(GEO.body, mantleGrey, body, [0, 0.98 * scale, 0.55 * scale], [0.55 * scale, 0.55 * scale, 0.62 * scale]);
  ruff.rotation.x = -0.32;

  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 1.18 * scale, 0.82 * scale);
  body.add(head);

  mesh(GEO.head, mantleGrey, head, [0, 0, 0], [0.35 * scale, 0.32 * scale, 0.38 * scale]);
  mesh(GEO.muzzle, throatCream, head, [0, -0.06 * scale, 0.34 * scale], [0.22 * scale, 0.18 * scale, 0.38 * scale]);
  mesh(GEO.muzzle, noseBlack, head, [0, -0.02 * scale, 0.52 * scale], [0.11 * scale, 0.08 * scale, 0.12 * scale]);

  for (const side of [-1, 1]) {
    mesh(GEO.eye, amberEye, head, [side * 0.155 * scale, 0.09 * scale, 0.19 * scale], [1, 1, 1]);
    const ear = mesh(GEO.ear, mantleGrey, head, [side * 0.18 * scale, 0.28 * scale, -0.06 * scale], [0.7 * scale, 1.1 * scale, 0.5 * scale]);
    ear.rotation.z = -side * 0.35;
  }

  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.82 * scale, -0.72 * scale);
  body.add(tail);
  const tailMesh = mesh(GEO.tail, mantleGrey, tail, [0, -0.35 * scale, -0.15 * scale], [0.35 * scale, 0.95 * scale, 0.35 * scale]);
  tailMesh.rotation.x = -0.45;

  const legs: THREE.Group[] = [];
  for (const x of [-0.24, 0.24]) {
    for (const z of [-0.42, 0.38]) {
      const pivot = new THREE.Group();
      pivot.position.set(x * scale, 0.52 * scale, z * scale);
      body.add(pivot);

      const upper = mesh(GEO.leg, mantleGrey, pivot, [0, -0.22 * scale, 0], [0.85 * scale, 1.05 * scale, 0.85 * scale]);
      upper.position.y = -0.22 * scale;
      mesh(GEO.muzzle, pawMat, pivot, [0, -0.52 * scale, 0.04 * scale], [0.16 * scale, 0.1 * scale, 0.22 * scale]);
      legs.push(pivot);
    }
  }

  root.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { root, body, legs, head, tail };
}

function buildFoxModel(gender: Gender, isBaby: boolean): BuiltAnimal {
  const root = new THREE.Group();
  root.name = isBaby ? 'fox-kit' : 'red-fox';
  const scale = isBaby ? 0.48 : 0.82;

  const rustOrange = mat(0xdb5823, 0.88);
  const bellyWhite = mat(0xf9f7f2, 0.85);
  const earBackBlack = mat(0x1a1a1b, 0.4);
  const pawBlack = mat(0x212124, 0.6);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  mesh(GEO.body, rustOrange, body, [0, 0.48 * scale, 0], [0.65 * scale, 0.48 * scale, 1.15 * scale]);
  mesh(GEO.body, bellyWhite, body, [0, 0.38 * scale, 0.15 * scale], [0.52 * scale, 0.35 * scale, 0.75 * scale]);

  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 0.78 * scale, 0.65 * scale);
  body.add(head);

  mesh(GEO.head, rustOrange, head, [0, 0, 0], [0.26 * scale, 0.24 * scale, 0.32 * scale]);
  mesh(GEO.muzzle, bellyWhite, head, [0, -0.05 * scale, 0.28 * scale], [0.18 * scale, 0.14 * scale, 0.32 * scale]);
  mesh(GEO.muzzle, earBackBlack, head, [0, -0.02 * scale, 0.44 * scale], [0.08 * scale, 0.06 * scale, 0.09 * scale]);

  for (const side of [-1, 1]) {
    const ear = mesh(GEO.ear, earBackBlack, head, [side * 0.15 * scale, 0.24 * scale, -0.04 * scale], [0.65 * scale, 1.15 * scale, 0.45 * scale]);
    ear.rotation.z = -side * 0.35;
    mesh(GEO.ear, bellyWhite, ear, [0, 0.02, 0.02], [0.75, 0.75, 0.75]);
  }

  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.55 * scale, -0.62 * scale);
  body.add(tail);
  const tailMesh = mesh(GEO.tail, rustOrange, tail, [0, -0.22 * scale, -0.28 * scale], [0.45 * scale, 1.25 * scale, 0.45 * scale]);
  tailMesh.rotation.x = -1.15;
  mesh(GEO.body, bellyWhite, tailMesh, [0, -0.65 * scale, 0], [0.48, 0.55, 0.48]);

  const legs: THREE.Group[] = [];
  for (const x of [-0.18, 0.18]) {
    for (const z of [-0.34, 0.28]) {
      const pivot = new THREE.Group();
      pivot.position.set(x * scale, 0.36 * scale, z * scale);
      body.add(pivot);

      const upper = mesh(GEO.leg, pawBlack, pivot, [0, -0.16 * scale, 0], [0.65 * scale, 0.85 * scale, 0.65 * scale]);
      upper.position.y = -0.16 * scale;
      legs.push(pivot);
    }
  }

  root.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { root, body, legs, head, tail };
}

function buildBoarModel(gender: Gender, isBaby: boolean): BuiltAnimal {
  const root = new THREE.Group();
  root.name = isBaby ? 'boar-piglet' : 'wild-boar';
  const scale = isBaby ? 0.48 : 0.95;

  const bristleBrown = mat(0x42342b, 0.95);
  const snoutPink = mat(0x9c7264, 0.75);
  const tuskIvory = mat(0xeee4cb, 0.8);
  const hoofDark = mat(0x1c1917, 0.6);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  mesh(GEO.body, bristleBrown, body, [0, 0.68 * scale, 0], [1.05 * scale, 0.82 * scale, 1.45 * scale]);
  mesh(GEO.body, bristleBrown, body, [0, 0.98 * scale, 0.35 * scale], [0.75 * scale, 0.52 * scale, 0.85 * scale]);

  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 0.88 * scale, 0.85 * scale);
  body.add(head);

  mesh(GEO.head, bristleBrown, head, [0, 0, 0], [0.42 * scale, 0.38 * scale, 0.55 * scale]);
  mesh(GEO.muzzle, snoutPink, head, [0, -0.12 * scale, 0.45 * scale], [0.28 * scale, 0.22 * scale, 0.28 * scale]);

  if (!isBaby) {
    for (const side of [-1, 1]) {
      const tusk = mesh(GEO.horn, tuskIvory, head, [side * 0.18 * scale, -0.06 * scale, 0.38 * scale], [0.75 * scale, 0.85 * scale, 0.75 * scale]);
      tusk.rotation.x = 0.55;
      tusk.rotation.z = side * 0.35;
    }
  }

  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.72 * scale, -0.75 * scale);
  body.add(tail);
  mesh(GEO.tail, bristleBrown, tail, [0, -0.22 * scale, -0.08 * scale], [0.25 * scale, 0.65 * scale, 0.25 * scale]);

  const legs: THREE.Group[] = [];
  for (const x of [-0.28, 0.28]) {
    for (const z of [-0.42, 0.38]) {
      const pivot = new THREE.Group();
      pivot.position.set(x * scale, 0.44 * scale, z * scale);
      body.add(pivot);

      const upper = mesh(GEO.leg, bristleBrown, pivot, [0, -0.2 * scale, 0], [0.95 * scale, 0.95 * scale, 0.95 * scale]);
      upper.position.y = -0.2 * scale;
      mesh(GEO.muzzle, hoofDark, pivot, [0, -0.42 * scale, 0.02 * scale], [0.18 * scale, 0.1 * scale, 0.2 * scale]);
      legs.push(pivot);
    }
  }

  root.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { root, body, legs, head, tail };
}

function buildRabbitModel(gender: Gender, isBaby: boolean): BuiltAnimal {
  const root = new THREE.Group();
  root.name = isBaby ? 'rabbit-kit' : 'cottontail-rabbit';
  const scale = isBaby ? 0.38 : 0.65;

  const coatBrown = mat(0xa89682, 0.88);
  const bellyWhite = mat(0xf9f7f4, 0.85);
  const cottonWhite = mat(0xffffff, 0.9);
  const earPink = mat(0xdeb3aa, 0.7);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  mesh(GEO.body, coatBrown, body, [0, 0.36 * scale, 0], [0.55 * scale, 0.48 * scale, 0.85 * scale]);
  mesh(GEO.body, bellyWhite, body, [0, 0.26 * scale, 0.1 * scale], [0.45 * scale, 0.32 * scale, 0.65 * scale]);

  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 0.58 * scale, 0.45 * scale);
  body.add(head);

  mesh(GEO.head, coatBrown, head, [0, 0, 0], [0.24 * scale, 0.24 * scale, 0.28 * scale]);
  mesh(GEO.muzzle, bellyWhite, head, [0, -0.06 * scale, 0.22 * scale], [0.15 * scale, 0.12 * scale, 0.22 * scale]);

  for (const side of [-1, 1]) {
    const ear = mesh(GEO.ear, coatBrown, head, [side * 0.1 * scale, 0.38 * scale, -0.04 * scale], [0.55 * scale, 1.65 * scale, 0.35 * scale]);
    ear.rotation.z = -side * 0.25;
    mesh(GEO.ear, earPink, ear, [0, 0.02, 0.02], [0.7, 0.85, 0.7]);
  }

  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.38 * scale, -0.45 * scale);
  body.add(tail);
  mesh(GEO.head, cottonWhite, tail, [0, 0.04 * scale, -0.06 * scale], [0.18 * scale, 0.18 * scale, 0.18 * scale]);

  const legs: THREE.Group[] = [];
  for (const x of [-0.14, 0.14]) {
    const pivot = new THREE.Group();
    pivot.position.set(x * scale, 0.24 * scale, -0.22 * scale);
    body.add(pivot);

    mesh(GEO.leg, coatBrown, pivot, [0, -0.08 * scale, 0], [0.7 * scale, 0.8 * scale, 0.7 * scale]);
    mesh(GEO.muzzle, cottonWhite, pivot, [0, -0.18 * scale, 0.1 * scale], [0.15 * scale, 0.08 * scale, 0.34 * scale]);
    legs.push(pivot);
  }

  root.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { root, body, legs, head, tail };
}

function buildAnimalModel(species: Species, gender: Gender, isBaby: boolean): BuiltAnimal {
  switch (species) {
    case 'deer':
      return buildDeerModel(gender, isBaby);
    case 'cow':
      return buildCowModel(gender, isBaby);
    case 'duck':
      return buildDuckModel(gender, isBaby);
    case 'wolf':
      return buildWolfModel(gender, isBaby);
    case 'fox':
      return buildFoxModel(gender, isBaby);
    case 'boar':
      return buildBoarModel(gender, isBaby);
    case 'rabbit':
    default:
      return buildRabbitModel(gender, isBaby);
  }
}

// --- LIVING PERSISTENT ECOSYSTEM SIMULATOR ---

export class WildlifeSystem {
  private animals = new Map<string, AnimalState>();
  private chunksLoaded = new Set<string>();
  private options: WildlifeOptions;
  private size: number;
  private elapsed = 0;
  private idCounter = 1;

  // Extinction & Ecosystem Health Tracking
  private extinctSpecies = new Set<Species>();
  private births = 0;
  private successfulHunts = 0;
  private failedHunts = 0;
  private balanceTimer = 45.0;
  private frameCounter = 0;

  constructor(options: WildlifeOptions) {
    this.options = options;
    this.size = options.chunkSize;
    // Initial auto-balance on world start
    setTimeout(() => this.balanceEcosystem(false), 200);
  }

  get trust(): Record<string, number> {
    return this.options.trust;
  }

  getSpeciesCount(sp: Species): number {
    let count = 0;
    for (const a of this.animals.values()) {
      if (a.species === sp) count++;
    }
    return count;
  }

  spawnChunk(cx: number, cz: number, lod: number, parentGroup: THREE.Group): void {
    const chunkKey = `${cx},${cz}`;
    this.chunksLoaded.add(chunkKey);

    // If animals already exist in this chunk, attach their 3D meshes
    for (const a of this.animals.values()) {
      if (a.chunkKey === chunkKey && !a.isAttachedToScene) {
        parentGroup.add(a.root);
        a.isAttachedToScene = true;
      }
    }

    if (lod > 1) return;

    // Check if chunk was already initially seeded
    const alreadySeeded = Array.from(this.animals.values()).some(a => a.chunkKey === chunkKey);
    if (alreadySeeded) return;

    const wx = cx * this.size + this.size / 2;
    const wz = cz * this.size + this.size / 2;
    if (this.options.nearHome(wx, wz)) return;

    const biome = this.options.biomeAt(wx, wz);
    const countRoll = seeded(cx * 13, cz * 19);

    let targetCount = 0;
    if (biome === 'meadow' && countRoll < 0.65) targetCount = countRoll < 0.25 ? 3 : 2;
    else if (biome === 'forest' && countRoll < 0.6) targetCount = countRoll < 0.2 ? 3 : 1;
    else if (biome === 'wetland' && countRoll < 0.75) targetCount = 3; // Duck flocks
    else if (biome === 'riverbank' && countRoll < 0.75) targetCount = 2;
    else if (biome === 'alpine' && countRoll < 0.35) targetCount = 1;

    for (let i = 0; i < targetCount; i++) {
      const species = this.pickSpeciesForBiome(biome, cx + i, cz - i);
      if (this.extinctSpecies.has(species)) continue;
      if (this.getSpeciesCount(species) >= MAX_SPECIES_CAP[species]) continue;

      const gender: Gender = seeded(cx * 7 + i, cz * 11) > 0.48 ? 'female' : 'male';
      const isBaby = seeded(cx * 17 + i * 3, cz * 23) < 0.25;

      const sx = cx * this.size + 3 + seeded(cx + i * 5, cz) * (this.size - 6);
      const sz = cz * this.size + 3 + seeded(cz, cx + i * 5) * (this.size - 6);

      if (this.options.nearHome(sx, sz) || this.options.roadAt(sx, sz)) continue;
      const wet = this.options.waterAt(sx, sz);
      if (species !== 'duck' && wet) continue;

      this.createAnimal(species, gender, isBaby, sx, sz, chunkKey, parentGroup);
    }
  }

  private pickSpeciesForBiome(biome: Biome, a: number, b: number): Species {
    const roll = seeded(a * 43, b * 71);
    const wolves = this.getSpeciesCount('wolf');
    const foxes = this.getSpeciesCount('fox');

    if (biome === 'riverbank' || biome === 'wetland') {
      return roll < 0.75 ? 'duck' : roll < 0.9 ? 'deer' : (foxes < MAX_SPECIES_CAP.fox ? 'fox' : 'duck');
    }
    if (biome === 'meadow') {
      return roll < 0.45 ? 'cow' : roll < 0.75 ? 'deer' : 'rabbit';
    }
    if (biome === 'forest') {
      if (roll < 0.35) return 'deer';
      if (roll < 0.6) return 'boar';
      if (roll < 0.85) return 'rabbit';
      return wolves < MAX_SPECIES_CAP.wolf ? 'wolf' : 'deer';
    }
    if (biome === 'alpine') {
      return wolves < MAX_SPECIES_CAP.wolf && roll < 0.15 ? 'wolf' : roll < 0.7 ? 'deer' : 'rabbit';
    }
    return 'rabbit';
  }

  createAnimal(
    species: Species,
    gender: Gender,
    isBaby: boolean,
    x: number,
    z: number,
    chunkKey: string,
    parentGroup?: THREE.Group,
    motherId?: string
  ): AnimalState {
    const id = `fauna-${this.idCounter++}-${species}`;
    const built = buildAnimalModel(species, gender, isBaby);
    const root = built.root;
    root.name = id;

    const baseHp = species === 'cow' ? 140 : species === 'boar' ? 100 : species === 'wolf' ? 70 : species === 'deer' ? 75 : species === 'fox' ? 40 : species === 'duck' ? 25 : 20;
    const hp = isBaby ? Math.round(baseHp * 0.5) : baseHp;

    const initialY = this.options.waterAt(x, z) && species === 'duck' ? WATER_LEVEL - DUCK_WATER_OFFSET : this.options.heightAt(x, z);
    root.position.set(x, initialY, z);
    root.userData.animal = { id, species, gender, isBaby };

    const targetParent = parentGroup || this.options.faunaContainer;
    const isAttached = !!targetParent;

    const state: AnimalState = {
      id,
      species,
      gender,
      biome: this.options.biomeAt(x, z),
      chunkKey,
      root,
      body: built.body,
      legs: built.legs,
      head: built.head,
      tail: built.tail,
      wings: built.wings,
      home: new THREE.Vector2(x, z),
      target: new THREE.Vector2(x, z),
      think: 1 + Math.random() * 2,
      fleeCooldown: 0,
      mood: 'resting',
      phase: Math.random() * Math.PI * 2,
      direction: Math.random() * Math.PI * 2,
      trust: this.options.trust[species] || 0,
      isBaby,
      scale: isBaby ? 0.55 : 1.0,
      hp,
      maxHp: hp,
      hunger: PREDATORS.has(species) ? 0 : 10 + Math.random() * 20, // Predators start well-fed!
      thirst: 15 + Math.random() * 25,
      matingCooldown: isBaby ? 9999 : 20 + Math.random() * 40,
      age: isBaby ? 0 : 100,
      motherId,
      packId: HERD_ANIMALS.has(species) ? `${species}-herd-${chunkKey}` : PREDATORS.has(species) ? `wolf-pack-${chunkKey}` : undefined,
      isFlying: false,
      flyAltitude: 0,
      huntStamina: 0,
      isAttachedToScene: isAttached,
    };

    if (targetParent) {
      targetParent.add(root);
    }
    this.animals.set(id, state);
    return state;
  }

  removeChunk(chunkKey: string): void {
    this.chunksLoaded.delete(chunkKey);
    if (!this.options.faunaContainer) {
      for (const a of this.animals.values()) {
        if (a.chunkKey === chunkKey) {
          a.root.parent?.remove(a.root);
          a.isAttachedToScene = false;
        }
      }
    }
  }

  // Sanctuary Auto-Balancing: Restores extinct species and keeps predator packs sustainable
  balanceEcosystem(notifyPlayer = false): void {
    const census = this.speciesCensus();

    // 1. Cap excessive predators strictly to sustainable small packs (max 2 wolves, max 3 foxes)
    const wolfList: string[] = [];
    const foxList: string[] = [];
    for (const [id, a] of this.animals) {
      if (a.species === 'wolf') wolfList.push(id);
      if (a.species === 'fox') foxList.push(id);
    }
    if (wolfList.length > MAX_SPECIES_CAP.wolf) {
      const toRemove = wolfList.slice(MAX_SPECIES_CAP.wolf);
      for (const id of toRemove) {
        const a = this.animals.get(id);
        if (a) {
          a.root.parent?.remove(a.root);
          this.animals.delete(id);
        }
      }
    }
    if (foxList.length > MAX_SPECIES_CAP.fox) {
      const toRemove = foxList.slice(MAX_SPECIES_CAP.fox);
      for (const id of toRemove) {
        const a = this.animals.get(id);
        if (a) {
          a.root.parent?.remove(a.root);
          this.animals.delete(id);
        }
      }
    }

    // 2. Reintroduce extinct or critically low prey species across diverse natural habitats
    // Mallard Ducks along Riverwood riverbanks and Lake Silvermere
    if (census.duck.total < 10) {
      const needed = 10 - census.duck.total;
      for (let i = 0; i < needed; i++) {
        const gender: Gender = i % 2 === 0 ? 'female' : 'male';
        // Alternate between Riverwood River (x: 25-50, z: -30 to -60) and Lake Silvermere (x: -80, z: -65)
        const inLake = i % 2 === 0;
        const x = inLake ? -80 + (i * 4) : 28 + (i * 6);
        const z = inLake ? -65 + (i * 3) : -40 - (i * 5);
        this.createAnimal('duck', gender, false, x, z, `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`);
      }
    }

    // Wild Boars across deep western forests and southern thickets
    if (census.boar.total < 8) {
      const needed = 8 - census.boar.total;
      for (let i = 0; i < needed; i++) {
        const gender: Gender = i % 2 === 0 ? 'female' : 'male';
        const x = i % 2 === 0 ? -48 - i * 6 : 55 + i * 5;
        const z = i % 2 === 0 ? 32 + i * 7 : 45 - i * 6;
        this.createAnimal('boar', gender, false, x, z, `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`);
      }
    }

    // Pasture Cows in lush open pastures
    if (census.cow.total < 8) {
      const needed = 8 - census.cow.total;
      for (let i = 0; i < needed; i++) {
        const gender: Gender = i % 2 === 0 ? 'female' : 'male';
        const x = i % 2 === 0 ? 22 + i * 7 : -36 - i * 6;
        const z = i % 2 === 0 ? -18 - i * 5 : 24 + i * 5;
        this.createAnimal('cow', gender, false, x, z, `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`);
      }
    }

    // Forest Deer throughout woodland corridors
    if (census.deer.total < 10) {
      const needed = 10 - census.deer.total;
      for (let i = 0; i < needed; i++) {
        const gender: Gender = i % 2 === 0 ? 'female' : 'male';
        const x = i % 2 === 0 ? -32 - i * 8 : 42 + i * 7;
        const z = i % 2 === 0 ? -52 - i * 6 : -25 + i * 6;
        this.createAnimal('deer', gender, false, x, z, `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`);
      }
    }

    // Meadow Rabbits scattered in sunny grassland fields
    if (census.rabbit.total < 12) {
      const needed = 12 - census.rabbit.total;
      for (let i = 0; i < needed; i++) {
        const gender: Gender = i % 2 === 0 ? 'female' : 'male';
        const x = (i % 3 === 0 ? 18 : i % 3 === 1 ? -24 : 38) + (i * 3);
        const z = (i % 3 === 0 ? 24 : i % 3 === 1 ? 16 : -45) + (i * 2);
        this.createAnimal('rabbit', gender, false, x, z, `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`);
      }
    }

    // Ensure at least 1-2 small sustainable predators exist without overtaking
    if (census.fox.total === 0) {
      this.createAnimal('fox', 'male', false, 62, 38, `${Math.floor(62 / this.size)},${Math.floor(38 / this.size)}`);
      this.createAnimal('fox', 'female', false, -45, 52, `${Math.floor(-45 / this.size)},${Math.floor(52 / this.size)}`);
    }
    if (census.wolf.total === 0) {
      this.createAnimal('wolf', 'male', false, -68, -75, `${Math.floor(-68 / this.size)},${Math.floor(-75 / this.size)}`);
    }

    this.extinctSpecies.clear();

    if (notifyPlayer) {
      this.options.notify('🌿 Sanctuary Balanced: Extinct species repopulated and predator packs stabilized!');
    }
  }

  update(dt: number, playerPos: THREE.Vector3, sprinting: boolean): void {
    this.elapsed += dt;
    this.frameCounter++;

    // Periodic safety check: Auto-balance once every 45s (NOT 60 times a second!)
    this.balanceTimer -= dt;
    if (this.balanceTimer <= 0) {
      this.balanceTimer = 45.0;
      const census = this.speciesCensus();
      if (
        census.duck.total <= 2 ||
        census.boar.total <= 2 ||
        census.deer.total <= 2 ||
        census.cow.total <= 2 ||
        census.rabbit.total <= 2 ||
        census.wolf.total > MAX_SPECIES_CAP.wolf ||
        census.fox.total > MAX_SPECIES_CAP.fox
      ) {
        this.balanceEcosystem(true);
      }
    }

    for (const [id, a] of this.animals) {
      const p = a.root.position;
      const distToPlayer = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);

      // Performance Optimization: Throttle updates for distant unattached animals
      if (distToPlayer > 120 && (this.frameCounter + id.charCodeAt(0)) % 5 !== 0) {
        continue;
      }

      const isVisible = distToPlayer < 75 && a.isAttachedToScene;
      a.root.visible = isVisible;

      // 1. Aging & Maturation
      a.age += dt;
      if (a.isBaby && a.age > 65) {
        a.isBaby = false;
        a.scale = 1.0;
        a.maxHp *= 2;
        a.hp = a.maxHp;
        a.matingCooldown = 30;
        a.root.scale.setScalar(1.0);
        this.options.notify(`🌱 A young ${SPECIES_NAME[a.species]} matured into an adult!`);
      }

      // Predator hunger increases slowly (only hunts when hungry)
      if (PREDATORS.has(a.species)) {
        a.hunger = Math.min(100, a.hunger + dt * 0.012);
      } else {
        // Herbivores naturally graze lush pasture and flora!
        if (a.mood === 'foraging' || a.mood === 'drinking' || a.mood === 'resting' || a.mood === 'wandering' || a.mood === 'seeking_mate') {
          a.hunger = Math.max(0, a.hunger - dt * 3.5);
        } else {
          a.hunger = Math.min(100, a.hunger + dt * 0.015);
        }
      }

      // Ecological Thirst Simulation
      if (a.mood === 'drinking') {
        a.thirst = Math.max(0, (a.thirst ?? 0) - dt * 25);
      } else {
        const wf = queryWorldFields(p.x, p.z);
        const tempMult = wf.temperature > 22 ? 1.4 : 1.0;
        a.thirst = Math.min(100, (a.thirst ?? 0) + dt * 0.35 * tempMult);
      }
      a.matingCooldown = Math.max(0, a.matingCooldown - dt);
      a.think -= dt;

      // 2. Offspring Follow Mother
      if (a.isBaby && a.motherId) {
        const mother = this.animals.get(a.motherId);
        if (mother) {
          const dMother = Math.hypot(p.x - mother.root.position.x, p.z - mother.root.position.z);
          if (dMother > 3.0) {
            a.target.set(mother.root.position.x + (Math.random() - 0.5) * 1.5, mother.root.position.z + (Math.random() - 0.5) * 1.5);
            a.mood = 'wandering';
          }
        }
      }

      // 3. PREDATOR HUNTING: Only occurs when predator is TRULY HUNGRY (hunger >= 75)
      // When well-fed, predators peacefully roam, snooze, or drink.
      // Predators NEVER hunt endangered species (<= 6 members).
      const isHungry = a.hunger >= 75;
      if (PREDATORS.has(a.species) && isHungry && a.mood !== 'fleeing' && a.mood !== 'defending') {
        let nearestPrey: AnimalState | null = null;
        let minDist = 32;

        for (const [otherId, other] of this.animals) {
          if (otherId === id || PREDATORS.has(other.species)) continue;
          // Foxes ONLY hunt rabbits and vulnerable ducklings, NEVER large cows, stags, or boars!
          if (a.species === 'fox' && (other.species === 'boar' || other.species === 'cow' || other.species === 'deer' || (other.species === 'duck' && !other.isBaby))) continue;

          // Strict nature protection: Predators do NOT hunt endangered species!
          if (this.getSpeciesCount(other.species) <= 5) continue;

          const dPrey = Math.hypot(p.x - other.root.position.x, p.z - other.root.position.z);
          if (dPrey < minDist) {
            minDist = dPrey;
            nearestPrey = other;
          }
        }

        if (nearestPrey) {
          a.mood = 'hunting';
          a.targetPreyId = nearestPrey.id;
          a.target.set(nearestPrey.root.position.x, nearestPrey.root.position.z);

          // Chase stamina: if hunt exceeds 12s, predator tires out and rests
          a.huntStamina = (a.huntStamina || 0) + dt;
          if (a.huntStamina > 12) {
            a.huntStamina = 0;
            a.mood = 'resting';
            a.think = 16;
            a.hunger = Math.max(0, a.hunger - 10);
          }

          // Close in to strike
          if (minDist < 1.6) {
            a.huntStamina = 0;
            const damage = a.species === 'wolf' ? 24 : 14;
            nearestPrey.hp -= damage;
            nearestPrey.mood = 'fleeing';
            nearestPrey.fleeCooldown = 4.5;

            // Defensive retaliation: Large prey fights back fiercely!
            if (nearestPrey.species === 'boar') {
              a.hp -= 42; // Boar razor tusks!
            } else if (nearestPrey.species === 'cow' && !nearestPrey.isBaby) {
              a.hp -= 50; // Heavy bovine kick!
            } else if (nearestPrey.species === 'deer' && nearestPrey.gender === 'male' && !nearestPrey.isBaby) {
              a.hp -= 40; // Stag antler gore!
            }

            // Predator wounded/killed by defensive retaliation
            if (a.hp <= 0) {
              this.failedHunts++;
              this.options.notify(`⚠️ Defending ${SPECIES_NAME[nearestPrey.species]} wounded and repelled the hungry ${SPECIES_NAME[a.species]}!`);
              a.root.parent?.remove(a.root);
              this.animals.delete(id);
              continue;
            }

            // Prey caught
            if (nearestPrey.hp <= 0) {
              this.successfulHunts++;
              this.options.notify(`🍂 A ${SPECIES_NAME[a.species]} caught a ${SPECIES_NAME[nearestPrey.species]}.`);
              nearestPrey.root.parent?.remove(nearestPrey.root);
              this.animals.delete(nearestPrey.id);
              this.checkSpeciesExtinction(nearestPrey.species);

              // Satiated predator: Full meal, enters 6 minutes of quiet rest where hunting is disabled!
              a.hunger = 0;
              a.mood = 'resting';
              a.think = 360;
            }
          }
        } else {
          // No suitable prey found: wander and explore
          if (a.mood === 'hunting') {
            a.mood = 'wandering';
            a.think = 5;
          }
        }
      } else if (PREDATORS.has(a.species) && !isHungry && a.mood === 'hunting') {
        // Satiated predator stops hunting immediately
        a.mood = 'resting';
        a.think = 10;
      }

      // 4. ACTIVE MATE SEEKING & REPRODUCTION
      // Animals actively seek opposite-gender partners to reproduce.
      // Predators have very low reproduction rate and strictly controlled population limits.
      const canSeekMate = !a.isBaby && a.matingCooldown <= 0;
      const belowCap = this.getSpeciesCount(a.species) < MAX_SPECIES_CAP[a.species];
      const predatorCanMate = !PREDATORS.has(a.species) || (belowCap && a.hunger < 25 && this.getSpeciesCount(a.species) < (a.species === 'wolf' ? 2 : 3));

      if (canSeekMate && belowCap && predatorCanMate && a.mood !== 'hunting' && a.mood !== 'fleeing') {
        let nearestMate: AnimalState | null = null;
        let minMateDist = 150;

        for (const [otherId, other] of this.animals) {
          if (otherId === id || other.species !== a.species || other.isBaby || other.gender === a.gender) continue;
          if (other.matingCooldown > 12) continue; // Partner should also be close to ready

          const dMate = Math.hypot(p.x - other.root.position.x, p.z - other.root.position.z);
          if (dMate < minMateDist) {
            minMateDist = dMate;
            nearestMate = other;
          }
        }

        if (nearestMate) {
          a.mood = 'seeking_mate';
          a.target.set(nearestMate.root.position.x, nearestMate.root.position.z);
          a.think = 3.0;

          // Mutual courtship attraction: partner also turns to meet!
          if (nearestMate.mood !== 'fleeing' && nearestMate.mood !== 'hunting') {
            nearestMate.mood = 'seeking_mate';
            nearestMate.target.set(p.x, p.z);
            nearestMate.think = 3.0;
          }

          // Courtship & Birth when meeting within 3.5m!
          if (minMateDist < 3.5) {
            // Predator mating cooldowns are very long (450s-600s), prey cooldowns are healthy and brisk
            const cooldown =
              a.species === 'wolf' ? 600 :
              a.species === 'fox' ? 450 :
              a.species === 'cow' ? 60 :
              a.species === 'duck' ? 38 :
              a.species === 'rabbit' ? 28 :
              a.species === 'deer' ? 50 : 55;

            a.matingCooldown = cooldown;
            nearestMate.matingCooldown = cooldown;
            a.mood = 'mating';
            nearestMate.mood = 'mating';
            a.think = 4.0;
            nearestMate.think = 4.0;
            this.births++;

            const mother = a.gender === 'female' ? a : nearestMate;
            const babyGender: Gender = Math.random() > 0.48 ? 'female' : 'male';

            // Primary newborn baby
            this.createAnimal(
              a.species,
              babyGender,
              true,
              p.x + (Math.random() - 0.5) * 1.5,
              p.z + (Math.random() - 0.5) * 1.5,
              a.chunkKey,
              a.root.parent as THREE.Group,
              mother.id
            );

            // Ducks lay clutches (often 2 ducklings!)
            if (a.species === 'duck' && Math.random() < 0.7) {
              this.createAnimal(a.species, Math.random() > 0.5 ? 'male' : 'female', true, p.x + (Math.random() - 0.5) * 1.8, p.z + (Math.random() - 0.5) * 1.8, a.chunkKey, a.root.parent as THREE.Group, mother.id);
            }
            // Rabbits can have twin kits!
            if (a.species === 'rabbit' && Math.random() < 0.65) {
              this.createAnimal(a.species, Math.random() > 0.5 ? 'male' : 'female', true, p.x + (Math.random() - 0.5) * 1.5, p.z + (Math.random() - 0.5) * 1.5, a.chunkKey, a.root.parent as THREE.Group, mother.id);
            }

            this.options.notify(`✨ A new baby ${SPECIES_NAME[a.species]} was born to loving parents!`);
          }
        }
      }

      // 5. Herd Flocking Behavior (Ducks, Cows, Deer stick together)
      if (HERD_ANIMALS.has(a.species) && a.mood === 'resting' && a.think <= 0) {
        let herdCenterX = p.x;
        let herdCenterZ = p.z;
        let herdCount = 1;

        for (const [otherId, other] of this.animals) {
          if (otherId === id || other.species !== a.species) continue;
          const d = Math.hypot(p.x - other.root.position.x, p.z - other.root.position.z);
          if (d < 45) {
            herdCenterX += other.root.position.x;
            herdCenterZ += other.root.position.z;
            herdCount++;
          }
        }

        if (herdCount > 1) {
          herdCenterX /= herdCount;
          herdCenterZ /= herdCount;
          const distToCenter = Math.hypot(p.x - herdCenterX, p.z - herdCenterZ);
          if (distToCenter > 12) {
            a.target.set(herdCenterX + (Math.random() - 0.5) * 6, herdCenterZ + (Math.random() - 0.5) * 6);
            a.mood = 'wandering';
            a.think = 4.0;
          }
        }
      }

      // 6. Duck Flight Behavior: Flocking and soaring across water & meadow
      if (a.species === 'duck' && !a.isBaby) {
        if (!a.isFlying && a.think <= 0 && Math.random() < 0.18) {
          a.isFlying = true;
          a.mood = 'flying';
          a.think = 6.0;
          const flyAngle = Math.random() * Math.PI * 2;
          a.target.set(p.x + Math.sin(flyAngle) * 30, p.z + Math.cos(flyAngle) * 30);
        } else if (a.isFlying) {
          if (a.think <= 0 || Math.hypot(p.x - a.target.x, p.z - a.target.y) < 2.0) {
            a.isFlying = false;
            a.flyAltitude = 0;
            a.mood = this.options.waterAt(p.x, p.z) ? ('swimming' as any) : 'resting';
          }
        }
      }

      // 7. Player Proximity Fear & Trust
      if (distToPlayer < 6.5 && a.mood !== 'hunting' && a.mood !== 'defending') {
        const trust = a.trust;
        if (sprinting || distToPlayer < (trust > 2 ? 2.5 : 5.5)) {
          a.mood = 'fleeing';
          a.fleeCooldown = 3.5;
          const angleFromPlayer = Math.atan2(p.x - playerPos.x, p.z - playerPos.z);
          a.target.set(p.x + Math.sin(angleFromPlayer) * 14, p.z + Math.cos(angleFromPlayer) * 14);
        }
      }

      if (a.think <= 0 && a.mood !== 'hunting' && a.mood !== 'fleeing' && a.mood !== 'seeking_mate') {
        this.chooseNextTarget(a);
      }

      // Movement Execution
      const tx = a.target.x - p.x;
      const tz = a.target.y - p.z;
      const remaining = Math.hypot(tx, tz);
      const moving = remaining > 0.25 && a.mood !== 'drinking' && a.mood !== 'sleeping' && a.mood !== 'mating';

      if (moving) {
        const desired = Math.atan2(tx, tz);
        a.direction += Math.atan2(Math.sin(desired - a.direction), Math.cos(desired - a.direction)) * Math.min(1, dt * 5.0);

        let speed = 1.0;
        if (a.isFlying) speed = 8.5;
        else if (a.mood === 'fleeing') speed = a.species === 'rabbit' ? 6.5 : a.species === 'wolf' ? 5.8 : 4.8;
        else if (a.mood === 'hunting') speed = 4.8;
        else if (a.mood === 'seeking_mate') speed = 2.2;
        else if (a.species === 'duck') speed = this.options.waterAt(p.x, p.z) ? 1.4 : 0.85;
        else speed = 1.1;

        const step = Math.min(remaining, speed * dt);
        p.x += Math.sin(a.direction) * step;
        p.z += Math.cos(a.direction) * step;

        const groundY = this.options.heightAt(p.x, p.z);
        const wet = this.options.waterAt(p.x, p.z);

        if (a.isFlying) {
          a.flyAltitude = Math.min(7.5, (a.flyAltitude || 0) + dt * 4.2);
          p.y = groundY + a.flyAltitude;
        } else if (wet && a.species === 'duck') {
          p.y = WATER_LEVEL - DUCK_WATER_OFFSET;
        } else {
          p.y = groundY;
        }

        // Track chunk boundary transitions
        const curChunkKey = `${Math.floor(p.x / this.size)},${Math.floor(p.z / this.size)}`;
        if (curChunkKey !== a.chunkKey) {
          a.chunkKey = curChunkKey;
          if (!this.chunksLoaded.has(curChunkKey) && a.isAttachedToScene) {
            a.root.parent?.remove(a.root);
            a.isAttachedToScene = false;
          }
        }
      }

      a.root.rotation.y = a.direction;

      // Skeletal Gait & Wing Animation
      if (isVisible) {
        const gait = this.elapsed * (a.isFlying ? 22 : a.mood === 'fleeing' ? 14 : 6.0) + a.phase;

        if (a.wings && a.wings.length === 2) {
          if (a.isFlying) {
            const flap = Math.sin(gait * 1.5) * 0.75;
            a.wings[0].rotation.z = flap;
            a.wings[1].rotation.z = -flap;
          } else {
            a.wings[0].rotation.z = 0;
            a.wings[1].rotation.z = 0;
          }
        }

        if (a.species === 'duck' && !a.isFlying && this.options.waterAt(p.x, p.z)) {
          a.body.position.y = Math.sin(this.elapsed * 2.2 + a.phase) * 0.015;
          for (let leg = 0; leg < a.legs.length; leg++) {
            a.legs[leg].rotation.x = moving ? Math.sin(gait + (leg % 2) * Math.PI) * 0.5 : 0;
          }
        } else if (a.legs.length === 4) {
          // Quadruped diagonal trotting gait (Front-Left & Back-Right together; Front-Right & Back-Left together!)
          const trot = gait * 1.25;
          const legPhase = [0, Math.PI, Math.PI, 0]; // [FL, FR, BL, BR]
          const legAmp = a.mood === 'fleeing' ? 0.75 : a.mood === 'hunting' ? 0.65 : 0.45;
          for (let leg = 0; leg < 4; leg++) {
            a.legs[leg].rotation.x = moving ? Math.sin(trot + legPhase[leg]) * legAmp : 0;
          }
          if (moving && (a.species === 'deer' || a.species === 'rabbit')) {
            const leap = Math.abs(Math.sin(gait * 0.5)) * (a.species === 'deer' ? 0.35 : 0.22);
            a.body.position.y = leap;
          } else {
            a.body.position.y = Math.sin(this.elapsed * 2.4 + a.phase) * (moving ? 0.025 : 0.012);
          }
        } else {
          for (let leg = 0; leg < a.legs.length; leg++) {
            a.legs[leg].rotation.x = moving ? Math.sin(gait + leg * Math.PI) * 0.5 : 0;
          }
        }

        if (a.mood === 'sleeping') {
          a.body.position.y = -0.22 * a.scale;
          a.head.rotation.x = 0.3;
        } else if (a.mood === 'foraging') {
          a.body.position.y = 0;
          a.head.rotation.x = 0.45 + Math.sin(this.elapsed * 2.0) * 0.12;
        } else if (a.mood === 'drinking') {
          a.body.position.y = -0.06 * a.scale;
          a.head.rotation.x = 0.58 + Math.sin(this.elapsed * 3.5) * 0.08;
        } else {
          a.body.position.y = 0;
          a.head.rotation.x = Math.sin(this.elapsed * 1.8 + a.phase) * 0.06;
        }

        a.tail.rotation.y = Math.sin(this.elapsed * 4.0 + a.phase) * 0.25;
      }
    }
  }

  private checkSpeciesExtinction(species: Species) {
    const count = this.getSpeciesCount(species);
    if (count <= 2) {
      this.options.notify(`🌿 Migrating wild breeding pair of ${SPECIES_NAME[species]} arrived to reinforce the sanctuary!`);
      this.balanceEcosystem(false);
    }
  }

  private chooseNextTarget(a: AnimalState): void {
    const p = a.root.position;
    const isThirsty = (a.thirst ?? 0) > 45;

    const wm = this.options.worldModel || defaultWorldModel;

    // 1. Thirst response: Search for reachable freshwater stream, river, or lake via WorldModel
    if (isThirsty && a.species !== 'duck') {
      const nearWaterNow = wm.hasWater(p.x, p.z) || wm.getWaterDepth(p.x, p.z) > 0.05 || isRiverAt(p.x, p.z, 8) || riverDistanceAt(p.x, p.z) < 4.5;
      if (nearWaterNow) {
        a.mood = 'drinking';
        a.think = 5.0 + Math.random() * 3.0;
        return;
      }

      // Sample 12 directions around animal to find closest water resource using WorldModel
      let bestWaterDist = 999;
      let targetWaterX = 0, targetWaterZ = 0;
      for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 6) {
        for (let r = 5; r <= 36; r += 5) {
          const sx = p.x + Math.sin(ang) * r;
          const sz = p.z + Math.cos(ang) * r;
          if (wm.hasWater(sx, sz) || wm.getWaterDepth(sx, sz) > 0.05 || isRiverAt(sx, sz, 9)) {
            const d = Math.hypot(sx - p.x, sz - p.z);
            if (d < bestWaterDist) {
              bestWaterDist = d;
              targetWaterX = sx;
              targetWaterZ = sz;
            }
            break;
          }
        }
      }

      if (bestWaterDist < 45 && !this.options.nearHome(targetWaterX, targetWaterZ)) {
        a.target.set(targetWaterX, targetWaterZ);
        a.mood = 'wandering';
        a.think = 6.0;
        return;
      }
    }

    // 2. Resource & Habitat Preference Tracking using WorldModel
    // Animals evaluate candidate positions using deterministic elevation, moisture, vegetationDensity, and biome
    const turn = Math.floor(this.elapsed / 6 + a.phase * 3);
    const wanderRadius = a.species === 'cow' ? 14.0 : a.species === 'deer' ? 18.0 : a.species === 'duck' ? 10.0 : a.species === 'wolf' ? 22.0 : 9.0;
    
    let bestScore = -Infinity;
    let bestX = a.home.x;
    let bestZ = a.home.y;

    const candidateCount = 6;
    for (let c = 0; c < candidateCount; c++) {
      const angle = (c / candidateCount) * Math.PI * 2 + seeded(Math.round(a.home.x * 11) + turn + c, Math.round(a.home.y * 13) - c) * 0.8;
      const dist = 3.0 + seeded(Math.round(a.home.x * 23) - turn - c, Math.round(a.home.y * 29) + c) * wanderRadius;
      const cx = p.x + Math.sin(angle) * dist;
      const cz = p.z + Math.cos(angle) * dist;

      if (this.options.nearHome(cx, cz) || this.options.roadAt(cx, cz)) continue;

      const f = wm.queryFields(cx, cz);
      const isWet = f.waterDepth > 0.02 || wm.hasWater(cx, cz);

      // Habitat suitability scoring based on species ecological niche
      let score = 0;
      if (a.species === 'duck') {
        // Ducks seek water bodies, riverbanks, and wetlands
        score = isWet ? 10.0 : f.biome === 'riverbank' || f.biome === 'wetland' ? 7.0 : 1.0;
      } else {
        // Non-aquatic animals avoid drowning in deep water
        if (isWet && f.waterDepth > 0.5) continue;

        if (a.species === 'cow') {
          // Cows seek lush meadows and gentle pastures with high soil moisture
          const slopePenalty = f.slope > 0.35 ? -5.0 : 0;
          score = (f.biome === 'meadow' ? 5.0 : 1.0) + f.soilMoisture * 4.0 + f.vegetationDensity * 4.0 + slopePenalty;
        } else if (a.species === 'deer') {
          // Deer prefer forest canopy, woodlands, and lush meadows
          score = (f.biome === 'forest' ? 5.0 : f.biome === 'meadow' ? 3.0 : 1.0) + f.vegetationDensity * 3.5;
        } else if (a.species === 'rabbit') {
          // Rabbits thrive in sunny meadow grasslands and open terrain
          score = (f.biome === 'meadow' ? 4.5 : 2.0) + (1.0 - f.slope) * 2.0 + f.vegetationDensity * 2.5;
        } else if (a.species === 'boar') {
          // Boars root in moist soil, wetlands, and dense forest thickets
          score = (f.biome === 'forest' ? 4.0 : f.biome === 'wetland' ? 4.5 : 2.0) + f.soilMoisture * 3.5;
        } else if (a.species === 'wolf') {
          // Wolves roam foothills, highland ridges, and forest corridors
          score = (f.biome === 'alpine' ? 4.0 : f.biome === 'forest' ? 3.5 : 2.0) + (f.elevation > 15 ? 2.5 : 0);
        } else if (a.species === 'fox') {
          // Foxes patrol forest borders, riverbanks, and meadow fringes
          score = (f.biome === 'forest' ? 3.5 : f.biome === 'riverbank' ? 3.5 : 2.5) + f.vegetationDensity * 2.0;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestX = cx;
        bestZ = cz;
      }
    }

    if (bestScore > -Infinity) {
      a.target.set(bestX, bestZ);
      const rMood = seeded(Math.round(bestX * 7) + turn, Math.round(bestZ * 11) - turn);
      a.mood = rMood < 0.25 ? 'resting' : rMood < 0.75 ? 'foraging' : 'wandering';
      a.think = 4.0 + rMood * 5.0;
    } else {
      a.target.copy(a.home);
      a.think = 2.0;
    }
  }

  interact(root: THREE.Object3D): void {
    const data = root.userData.animal as { id: string; species: Species } | undefined;
    if (!data) return;
    const a = this.animals.get(data.id);
    if (!a) return;

    if (this.options.hasFruit()) {
      this.options.consumeFruit();
      a.trust = Math.min(5, a.trust + 1);
      this.options.trust[a.species] = a.trust;
      this.options.onTrustChange();
      a.mood = 'curious';
      a.fleeCooldown = 0;
      a.hunger = Math.max(0, a.hunger - 40);
      this.options.notify(`Fed ${SPECIES_NAME[a.species]}! Trust increased (${a.trust}/5).`);
    } else {
      const genderStr = a.gender === 'male' ? '♂ Male' : '♀ Female';
      const ageStr = a.isBaby ? 'Young' : 'Adult';
      const moodStr = a.mood.toUpperCase();
      this.options.notify(`${SPECIES_NAME[a.species]} (${genderStr}, ${ageStr}) · HP: ${a.hp}/${a.maxHp} · ${moodStr}`);
    }
  }

  markers(): AnimalMarker[] {
    const list: AnimalMarker[] = [];
    for (const a of this.animals.values()) {
      // Only include animals currently attached to the active scene
      if (!a.isAttachedToScene) continue;
      list.push({
        x: a.root.position.x,
        z: a.root.position.z,
        species: a.species,
        gender: a.gender,
        isBaby: a.isBaby,
        hp: a.hp,
        isFlying: a.isFlying,
      });
    }
    return list;
  }

  speciesCensus(): Record<Species, { total: number; males: number; females: number; babies: number; status: string }> {
    const speciesList: Species[] = ['deer', 'cow', 'duck', 'wolf', 'fox', 'boar', 'rabbit'];
    const record = {} as Record<Species, { total: number; males: number; females: number; babies: number; status: string }>;

    for (const sp of speciesList) {
      let total = 0, males = 0, females = 0, babies = 0;
      for (const a of this.animals.values()) {
        if (a.species === sp) {
          total++;
          if (a.isBaby) babies++;
          else if (a.gender === 'male') males++;
          else females++;
        }
      }
      let status = 'Thriving';
      if (total === 0) status = 'Extinct';
      else if (total <= 3) status = 'Critically Endangered';
      else if (total <= 6) status = 'Vulnerable';
      record[sp] = { total, males, females, babies, status };
    }
    return record;
  }

  status(playerPos: THREE.Vector3): string {
    let nearest: AnimalState | null = null;
    let minDist = 35;
    for (const a of this.animals.values()) {
      const d = Math.hypot(a.root.position.x - playerPos.x, a.root.position.z - playerPos.z);
      if (d < minDist) {
        minDist = d;
        nearest = a;
      }
    }
    if (!nearest) return `Living Ecosystem (${this.animals.size} animals in sanctuary)`;
    const genderTag = nearest.gender === 'male' ? '♂' : '♀';
    const babyTag = nearest.isBaby ? 'Young ' : '';
    return `${SPECIES_ICON[nearest.species]} ${babyTag}${SPECIES_NAME[nearest.species]} ${genderTag} (${Math.round(minDist)}m, ${nearest.mood})`;
  }
}
