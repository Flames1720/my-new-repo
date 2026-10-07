import * as THREE from 'three';
import type { Biome, Species, Mood, AnimalMarker, AnimalState } from './types';
import { clamp, lerp, SEED, WATER_LEVEL } from './terrain';

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
}

export const SPECIES_NAME: Record<Species, string> = {
  deer: 'White-tailed deer',
  rabbit: 'Cottontail rabbit',
  fox: 'Red fox',
  wolf: 'Grey wolf',
  boar: 'Wild boar',
  duck: 'Mallard duck',
};

const SPECIES_COLOR: Record<Species, number> = {
  deer: 0xb57f4e,
  rabbit: 0xb2a18e,
  fox: 0xd95f26,
  wolf: 0x6e7680,
  boar: 0x473932,
  duck: 0x2b6343,
};

const SPECIES_ICON: Record<Species, string> = {
  deer: '🦌',
  rabbit: '🐇',
  fox: '🦊',
  wolf: '🐺',
  boar: '🐗',
  duck: '🦆',
};

const AQUATIC = new Set<Species>(['duck']);
const FLEEING = new Set<Species>(['deer', 'rabbit', 'fox', 'wolf', 'boar', 'duck']);

export const DUCK_WATER_OFFSET = 0.28;

// Reusable Shared Geometries & Materials
const MAT = new Map<number, THREE.MeshStandardMaterial>();
const GEO = {
  body: new THREE.SphereGeometry(1, 12, 9),
  head: new THREE.SphereGeometry(1, 11, 9),
  leg: new THREE.CapsuleGeometry(0.08, 0.42, 3, 6),
  ear: new THREE.ConeGeometry(0.12, 0.48, 5),
  horn: new THREE.CylinderGeometry(0.022, 0.065, 0.52, 5),
  muzzle: new THREE.SphereGeometry(1, 9, 7),
  tail: new THREE.ConeGeometry(0.18, 0.72, 6),
  eye: new THREE.SphereGeometry(0.045, 7, 6),
  highlight: new THREE.SphereGeometry(0.016, 4, 3),
  box: new THREE.BoxGeometry(1, 1, 1),
};

const SHARED_ANIMAL_ASSETS = new Set<THREE.BufferGeometry | THREE.Material>(Object.values(GEO));

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

// --- AUTHENTIC SPECIES MODEL BUILDERS ---

// 1. DEER MODEL (Slender legs, white rump, arch neck, branching antlers, spotted fawn)
function buildDeerModel(isBaby: boolean) {
  const root = new THREE.Group();
  root.name = isBaby ? 'deer-fawn' : 'deer-stag';
  const scale = isBaby ? 0.55 : 1.0;

  const fawnCoat = 0xc98f56, stagCoat = 0xad7242;
  const fur = mat(isBaby ? fawnCoat : stagCoat, 0.88);
  const bellyWhite = mat(0xf7eedb, 0.85);
  const hoofBlack = mat(0x23211f, 0.6);
  const antlerBone = mat(0xe8dcc8, 0.9);
  const noseBlack = mat(0x181817, 0.4);
  const eyeBlack = mat(0x111111, 0.2);
  const eyeHighlight = mat(0xffffff, 0.2);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  // Deep chest tapering to lean flank
  mesh(GEO.body, fur, body, [0, 0.82 * scale, 0], [0.85 * scale, 0.62 * scale, 1.25 * scale]);
  // White underbelly and chest bib
  mesh(GEO.body, bellyWhite, body, [0, 0.72 * scale, 0.15 * scale], [0.65 * scale, 0.45 * scale, 0.9 * scale]);

  // Arched cervid neck
  const neck = mesh(GEO.body, fur, body, [0, 1.22 * scale, 0.52 * scale], [0.32 * scale, 0.68 * scale, 0.36 * scale]);
  neck.rotation.x = -0.42;

  // Spotted fawn dapples
  if (isBaby) {
    for (let s = -2; s <= 2; s++) {
      mesh(GEO.highlight, bellyWhite, body, [0.22 * scale, (0.95 + Math.abs(s) * 0.04) * scale, s * 0.2 * scale], [1.6, 1.6, 1.6]);
      mesh(GEO.highlight, bellyWhite, body, [-0.22 * scale, (0.95 + Math.abs(s) * 0.04) * scale, s * 0.2 * scale], [1.6, 1.6, 1.6]);
    }
  }

  // Head
  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 1.48 * scale, 0.82 * scale);
  body.add(head);

  mesh(GEO.head, fur, head, [0, 0, 0], [0.26 * scale, 0.28 * scale, 0.36 * scale]);
  // Tapered deer muzzle with white muzzle ring
  mesh(GEO.muzzle, bellyWhite, head, [0, -0.06 * scale, 0.32 * scale], [0.18 * scale, 0.16 * scale, 0.28 * scale]);
  mesh(GEO.muzzle, noseBlack, head, [0, -0.04 * scale, 0.44 * scale], [0.09 * scale, 0.07 * scale, 0.1 * scale]);

  // Gentle eyes with white eye ring
  for (const side of [-1, 1]) {
    mesh(GEO.eye, bellyWhite, head, [side * 0.14 * scale, 0.07 * scale, 0.22 * scale], [1.3, 1.3, 1.3]);
    const eye = mesh(GEO.eye, eyeBlack, head, [side * 0.145 * scale, 0.07 * scale, 0.23 * scale], [1, 1, 1]);
    mesh(GEO.highlight, eyeHighlight, eye, [side * 0.015, 0.015, 0.035], [1, 1, 1]);
  }

  // Leaf-shaped erect deer ears with white interior
  for (const side of [-1, 1]) {
    const ear = mesh(GEO.ear, fur, head, [side * 0.16 * scale, 0.26 * scale, -0.04 * scale], [0.8 * scale, 1.35 * scale, 0.5 * scale]);
    ear.rotation.z = -side * 0.28;
    ear.rotation.x = -0.15;
    mesh(GEO.ear, bellyWhite, ear, [0, 0.02 * scale, 0.02 * scale], [0.65, 0.85, 0.6]);
  }

  // Branching stag antlers (adult buck only)
  if (!isBaby) {
    for (const side of [-1, 1]) {
      const antler = new THREE.Group();
      antler.position.set(side * 0.12 * scale, 0.26 * scale, 0.02 * scale);
      head.add(antler);
      // Main curved beam
      const beam = mesh(GEO.horn, antlerBone, antler, [side * 0.08 * scale, 0.35 * scale, -0.05 * scale], [1, 1.5, 1]);
      beam.rotation.z = -side * 0.32;
      beam.rotation.x = -0.22;
      // Brow tine
      const brow = mesh(GEO.horn, antlerBone, antler, [side * 0.02 * scale, 0.22 * scale, 0.12 * scale], [0.7, 0.9, 0.7]);
      brow.rotation.x = 0.65;
      brow.rotation.z = side * 0.15;
      // Top fork
      const fork = mesh(GEO.horn, antlerBone, antler, [side * 0.18 * scale, 0.52 * scale, -0.1 * scale], [0.65, 0.9, 0.65]);
      fork.rotation.z = -side * 0.65;
    }
  }

  // Tail (white-tailed flash)
  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.92 * scale, -0.68 * scale);
  body.add(tail);
  const tailMesh = mesh(GEO.tail, bellyWhite, tail, [0, -0.12 * scale, -0.08 * scale], [0.55 * scale, 0.75 * scale, 0.55 * scale]);
  tailMesh.rotation.x = 0.55;

  // Slender legs with hock joints and black hooves
  const legs: THREE.Group[] = [];
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.48, 0.42]) {
      const pivot = new THREE.Group();
      pivot.position.set(x * scale, 0.68 * scale, z * scale);
      body.add(pivot);

      // Thigh & Shin
      const leg = mesh(GEO.leg, fur, pivot, [0, -0.32 * scale, 0], [0.65 * scale, 1.45 * scale, 0.65 * scale]);
      leg.position.y = -0.34 * scale;
      // Black cloven hoof
      mesh(GEO.muzzle, hoofBlack, pivot, [0, -0.66 * scale, 0.02 * scale], [0.12 * scale, 0.1 * scale, 0.16 * scale]);
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

// 2. GREY WOLF MODEL (Muscular predator chest, thick ruff, long muzzle, amber eyes, bushy tail)
function buildWolfModel(isBaby: boolean) {
  const root = new THREE.Group();
  root.name = isBaby ? 'wolf-pup' : 'grey-wolf';
  const scale = isBaby ? 0.52 : 1.05;

  const mantleGrey = mat(0x565c63, 0.88);
  const darkSpine = mat(0x383c40, 0.9);
  const throatCream = mat(0xd4d8db, 0.85);
  const noseBlack = mat(0x161618, 0.35);
  const amberEye = mat(0xe5a329, 0.2);
  const eyeBlack = mat(0x111111, 0.2);
  const pawMat = mat(0x42464b, 0.8);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  // Muscular deep-chested canine torso
  mesh(GEO.body, mantleGrey, body, [0, 0.72 * scale, 0], [0.92 * scale, 0.68 * scale, 1.35 * scale]);
  // Dark dorsal saddle
  mesh(GEO.body, darkSpine, body, [0, 0.82 * scale, -0.05 * scale], [0.65 * scale, 0.45 * scale, 1.15 * scale]);
  // Pale throat and chest
  mesh(GEO.body, throatCream, body, [0, 0.62 * scale, 0.25 * scale], [0.68 * scale, 0.52 * scale, 0.85 * scale]);

  // Thick muscular neck ruff / scruff
  const ruff = mesh(GEO.body, mantleGrey, body, [0, 0.98 * scale, 0.55 * scale], [0.55 * scale, 0.55 * scale, 0.62 * scale]);
  ruff.rotation.x = -0.32;

  // Head
  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 1.18 * scale, 0.82 * scale);
  body.add(head);

  mesh(GEO.head, mantleGrey, head, [0, 0, 0], [0.35 * scale, 0.32 * scale, 0.38 * scale]);
  // Long wolf muzzle
  mesh(GEO.muzzle, throatCream, head, [0, -0.06 * scale, 0.34 * scale], [0.22 * scale, 0.18 * scale, 0.38 * scale]);
  mesh(GEO.muzzle, noseBlack, head, [0, -0.02 * scale, 0.52 * scale], [0.11 * scale, 0.08 * scale, 0.12 * scale]);

  // Piercing amber predator eyes with dark liner
  for (const side of [-1, 1]) {
    mesh(GEO.eye, noseBlack, head, [side * 0.15 * scale, 0.09 * scale, 0.18 * scale], [1.2, 1.2, 1.2]);
    const eye = mesh(GEO.eye, amberEye, head, [side * 0.155 * scale, 0.09 * scale, 0.19 * scale], [1, 1, 1]);
    mesh(GEO.highlight, eyeBlack, eye, [0, 0, 0.03], [0.5, 0.7, 0.5]);
  }

  // Pointed erect triangular wolf ears
  for (const side of [-1, 1]) {
    const ear = mesh(GEO.ear, mantleGrey, head, [side * 0.18 * scale, 0.26 * scale, -0.08 * scale], [0.9 * scale, 1.1 * scale, 0.6 * scale]);
    ear.rotation.z = -side * 0.35;
    mesh(GEO.ear, throatCream, ear, [0, 0.02 * scale, 0.02 * scale], [0.65, 0.8, 0.6]);
  }

  // Bushy straight hanging wolf tail with dark tip
  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.85 * scale, -0.72 * scale);
  body.add(tail);
  const tailMesh = mesh(GEO.tail, mantleGrey, tail, [0, -0.28 * scale, -0.22 * scale], [0.95 * scale, 1.45 * scale, 0.95 * scale]);
  tailMesh.rotation.x = -0.55;
  mesh(GEO.tail, darkSpine, tailMesh, [0, -0.28 * scale, 0], [0.85, 0.6, 0.85]);

  // Strong padded canine legs
  const legs: THREE.Group[] = [];
  for (const x of [-0.25, 0.25]) {
    for (const z of [-0.48, 0.45]) {
      const pivot = new THREE.Group();
      pivot.position.set(x * scale, 0.58 * scale, z * scale);
      body.add(pivot);

      const leg = mesh(GEO.leg, pawMat, pivot, [0, -0.26 * scale, 0], [0.82 * scale, 1.15 * scale, 0.82 * scale]);
      leg.position.y = -0.28 * scale;
      mesh(GEO.muzzle, pawMat, pivot, [0, -0.54 * scale, 0.06 * scale], [0.22 * scale, 0.11 * scale, 0.26 * scale]);
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

// 3. RED FOX MODEL (Vibrant orange coat, snowy bib, black ear backs, black stockings, white tail tip)
function buildFoxModel(isBaby: boolean) {
  const root = new THREE.Group();
  root.name = isBaby ? 'fox-kit' : 'red-fox';
  const scale = isBaby ? 0.5 : 0.88;

  const redOrange = mat(0xd95a20, 0.85);
  const pureWhite = mat(0xfbf8f2, 0.85);
  const blackStocking = mat(0x191817, 0.6);
  const noseBlack = mat(0x111111, 0.3);
  const amberEye = mat(0xeb9c24, 0.2);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  // Sleek nimble vulpine torso
  mesh(GEO.body, redOrange, body, [0, 0.55 * scale, 0], [0.65 * scale, 0.48 * scale, 1.15 * scale]);
  // Snowy white chest bib & belly
  mesh(GEO.body, pureWhite, body, [0, 0.48 * scale, 0.25 * scale], [0.52 * scale, 0.38 * scale, 0.85 * scale]);

  // Head
  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 0.85 * scale, 0.62 * scale);
  body.add(head);

  mesh(GEO.head, redOrange, head, [0, 0, 0], [0.26 * scale, 0.24 * scale, 0.3 * scale]);
  // Fluffy white cheek ruffs
  mesh(GEO.muzzle, pureWhite, head, [0.12 * scale, -0.05 * scale, 0.05 * scale], [0.18 * scale, 0.16 * scale, 0.18 * scale]);
  mesh(GEO.muzzle, pureWhite, head, [-0.12 * scale, -0.05 * scale, 0.05 * scale], [0.18 * scale, 0.16 * scale, 0.18 * scale]);

  // Sharp pointed fox muzzle with black nose
  mesh(GEO.muzzle, pureWhite, head, [0, -0.06 * scale, 0.24 * scale], [0.14 * scale, 0.12 * scale, 0.28 * scale]);
  mesh(GEO.muzzle, noseBlack, head, [0, -0.03 * scale, 0.38 * scale], [0.07 * scale, 0.06 * scale, 0.09 * scale]);

  // Amber eyes
  for (const side of [-1, 1]) {
    const eye = mesh(GEO.eye, amberEye, head, [side * 0.11 * scale, 0.07 * scale, 0.15 * scale], [1, 1, 1]);
    mesh(GEO.highlight, noseBlack, eye, [0, 0, 0.025], [0.5, 0.7, 0.5]);
  }

  // Large upright ears: black on back, pure white interior
  for (const side of [-1, 1]) {
    const ear = mesh(GEO.ear, blackStocking, head, [side * 0.14 * scale, 0.22 * scale, -0.05 * scale], [0.85 * scale, 1.25 * scale, 0.55 * scale]);
    ear.rotation.z = -side * 0.38;
    ear.rotation.x = -0.15;
    mesh(GEO.ear, pureWhite, ear, [0, 0.02 * scale, 0.03 * scale], [0.65, 0.85, 0.6]);
  }

  // Enormous bushy fox brush tail with white tip ("tag")
  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.62 * scale, -0.6 * scale);
  body.add(tail);
  const tailBase = mesh(GEO.tail, redOrange, tail, [0, -0.05 * scale, -0.35 * scale], [1.2 * scale, 1.7 * scale, 1.2 * scale]);
  tailBase.rotation.x = -1.25;
  // Distinctive white tail tag
  mesh(GEO.tail, pureWhite, tailBase, [0, 0.52 * scale, 0], [0.85, 0.65, 0.85]);

  // Slender black stocking legs
  const legs: THREE.Group[] = [];
  for (const x of [-0.18, 0.18]) {
    for (const z of [-0.38, 0.35]) {
      const pivot = new THREE.Group();
      pivot.position.set(x * scale, 0.44 * scale, z * scale);
      body.add(pivot);

      // Upper leg orange, lower stocking black
      const leg = mesh(GEO.leg, blackStocking, pivot, [0, -0.2 * scale, 0], [0.6 * scale, 0.95 * scale, 0.6 * scale]);
      leg.position.y = -0.22 * scale;
      mesh(GEO.muzzle, blackStocking, pivot, [0, -0.42 * scale, 0.04 * scale], [0.15 * scale, 0.08 * scale, 0.2 * scale]);
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

// 4. WILD BOAR MODEL (High shoulder hump, bristly mane, flat rooting disc snout, ivory tusks)
function buildBoarModel(isBaby: boolean) {
  const root = new THREE.Group();
  root.name = isBaby ? 'boar-piglet' : 'wild-boar';
  const scale = isBaby ? 0.58 : 1.15;

  const hideDark = mat(0x423630, 0.95);
  const bristleMane = mat(0x282320, 0.95);
  const snoutDisc = mat(0x73574c, 0.85);
  const ivoryTusk = mat(0xf2ecd9, 0.7);
  const eyeSmall = mat(0x141414, 0.3);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  // Heavy muscular body with high shoulder hump sloping to rear
  mesh(GEO.body, hideDark, body, [0, 0.85 * scale, 0], [1.1 * scale, 0.85 * scale, 1.45 * scale]);
  // Prominent shoulder hump
  mesh(GEO.body, hideDark, body, [0, 1.1 * scale, 0.25 * scale], [0.75 * scale, 0.55 * scale, 0.75 * scale]);
  // Bristly dorsal ridge along spine
  mesh(GEO.body, bristleMane, body, [0, 1.18 * scale, -0.05 * scale], [0.35 * scale, 0.35 * scale, 1.25 * scale]);

  // Head: Wedge-shaped boar skull
  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 0.95 * scale, 0.85 * scale);
  body.add(head);

  mesh(GEO.head, hideDark, head, [0, 0, 0], [0.42 * scale, 0.38 * scale, 0.5 * scale]);

  // Long snout ending in flat circular rooting disc
  mesh(GEO.muzzle, hideDark, head, [0, -0.12 * scale, 0.42 * scale], [0.28 * scale, 0.22 * scale, 0.42 * scale]);
  mesh(GEO.muzzle, snoutDisc, head, [0, -0.12 * scale, 0.62 * scale], [0.22 * scale, 0.18 * scale, 0.12 * scale]);

  // Upward-curving ivory lower tusks!
  if (!isBaby) {
    for (const side of [-1, 1]) {
      const tusk = mesh(GEO.horn, ivoryTusk, head, [side * 0.22 * scale, -0.16 * scale, 0.45 * scale], [0.8 * scale, 0.8 * scale, 0.8 * scale]);
      tusk.rotation.x = -1.25;
      tusk.rotation.z = side * 0.35;
    }
  }

  // Small dark bristly eyes
  for (const side of [-1, 1]) {
    mesh(GEO.eye, eyeSmall, head, [side * 0.19 * scale, 0.12 * scale, 0.18 * scale], [0.85, 0.85, 0.85]);
  }

  // Small bristly boar ears
  for (const side of [-1, 1]) {
    const ear = mesh(GEO.ear, bristleMane, head, [side * 0.22 * scale, 0.28 * scale, -0.08 * scale], [0.7 * scale, 0.85 * scale, 0.5 * scale]);
    ear.rotation.z = -side * 0.45;
  }

  // Short tufted tail
  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.82 * scale, -0.75 * scale);
  body.add(tail);
  mesh(GEO.tail, hideDark, tail, [0, -0.18 * scale, -0.12 * scale], [0.4 * scale, 0.65 * scale, 0.4 * scale]);

  // Stout heavy legs with cloven hooves
  const legs: THREE.Group[] = [];
  for (const x of [-0.32, 0.32]) {
    for (const z of [-0.42, 0.42]) {
      const pivot = new THREE.Group();
      pivot.position.set(x * scale, 0.55 * scale, z * scale);
      body.add(pivot);

      const leg = mesh(GEO.leg, hideDark, pivot, [0, -0.22 * scale, 0], [0.95 * scale, 0.95 * scale, 0.95 * scale]);
      leg.position.y = -0.24 * scale;
      mesh(GEO.muzzle, bristleMane, pivot, [0, -0.45 * scale, 0.04 * scale], [0.24 * scale, 0.12 * scale, 0.26 * scale]);
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

// 5. COTTONTAIL RABBIT MODEL (Compact hunched body, large leaping hind legs, pink ears, cotton ball tail)
function buildRabbitModel(isBaby: boolean) {
  const root = new THREE.Group();
  root.name = isBaby ? 'rabbit-kit' : 'cottontail-rabbit';
  const scale = isBaby ? 0.48 : 0.72;

  const agoutiCoat = mat(0xb09d89, 0.88);
  const cottonWhite = mat(0xf9f7f4, 0.85);
  const innerEarPink = mat(0xedafb8, 0.85);
  const nosePink = mat(0xdf98a4, 0.6);
  const eyeDark = mat(0x1b1918, 0.2);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  // Compact hunched body with powerful hindquarters
  mesh(GEO.body, agoutiCoat, body, [0, 0.42 * scale, 0], [0.65 * scale, 0.58 * scale, 0.88 * scale]);
  // Fluffy white chest
  mesh(GEO.body, cottonWhite, body, [0, 0.35 * scale, 0.22 * scale], [0.48 * scale, 0.42 * scale, 0.55 * scale]);

  // Head
  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 0.68 * scale, 0.42 * scale);
  body.add(head);

  mesh(GEO.head, agoutiCoat, head, [0, 0, 0], [0.25 * scale, 0.28 * scale, 0.32 * scale]);
  // Twitching pink nose and white cheeks
  mesh(GEO.muzzle, cottonWhite, head, [0, -0.06 * scale, 0.18 * scale], [0.16 * scale, 0.14 * scale, 0.18 * scale]);
  mesh(GEO.highlight, nosePink, head, [0, -0.02 * scale, 0.26 * scale], [1.5, 1.2, 1.5]);

  // Gentle dark eyes with white eye ring
  for (const side of [-1, 1]) {
    mesh(GEO.eye, cottonWhite, head, [side * 0.11 * scale, 0.08 * scale, 0.12 * scale], [1.3, 1.3, 1.3]);
    const eye = mesh(GEO.eye, eyeDark, head, [side * 0.115 * scale, 0.08 * scale, 0.13 * scale], [1, 1, 1]);
    mesh(GEO.highlight, cottonWhite, eye, [side * 0.015, 0.015, 0.03], [1, 1, 1]);
  }

  // Tall upright rabbit ears with pink interior
  for (const side of [-1, 1]) {
    const ear = mesh(GEO.ear, agoutiCoat, head, [side * 0.12 * scale, 0.36 * scale, -0.02 * scale], [0.65 * scale, 1.65 * scale, 0.45 * scale]);
    ear.rotation.z = -side * 0.12;
    mesh(GEO.ear, innerEarPink, ear, [0, 0.02 * scale, 0.03 * scale], [0.65, 0.85, 0.6]);
  }

  // Fluffy round white cotton-ball tail!
  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.45 * scale, -0.46 * scale);
  body.add(tail);
  mesh(GEO.body, cottonWhite, tail, [0, 0, 0], [0.22 * scale, 0.22 * scale, 0.22 * scale]);

  // Forepaws and muscular leaping hind feet
  const legs: THREE.Group[] = [];
  // Small front paws
  for (const x of [-0.14, 0.14]) {
    const pivot = new THREE.Group();
    pivot.position.set(x * scale, 0.28 * scale, 0.24 * scale);
    body.add(pivot);
    mesh(GEO.leg, agoutiCoat, pivot, [0, -0.12 * scale, 0], [0.5 * scale, 0.6 * scale, 0.5 * scale]);
    mesh(GEO.muzzle, cottonWhite, pivot, [0, -0.22 * scale, 0.04 * scale], [0.12 * scale, 0.06 * scale, 0.16 * scale]);
    legs.push(pivot);
  }
  // Large muscular hind feet
  for (const x of [-0.18, 0.18]) {
    const pivot = new THREE.Group();
    pivot.position.set(x * scale, 0.32 * scale, -0.22 * scale);
    body.add(pivot);
    // Large thigh
    mesh(GEO.body, agoutiCoat, pivot, [0, 0.05 * scale, 0], [0.25 * scale, 0.32 * scale, 0.38 * scale]);
    // Long foot
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

// 6. MALLARD DUCK MODEL (Drake iridescent head, white neck collar, chestnut breast, wing speculum, underwater webbed feet)
function buildDuckModel(isBaby: boolean) {
  const root = new THREE.Group();
  root.name = isBaby ? 'duckling' : 'mallard-duck';
  const scale = isBaby ? 0.48 : 0.82;

  const drakeGreen = mat(0x195e38, 0.6); // Emerald sheen
  const neckWhite = mat(0xf9f9f9, 0.8);
  const breastChestnut = mat(0x733f2c, 0.85);
  const bodyGrey = mat(0x9fa4a8, 0.88);
  const billYellow = mat(0xf5b325, 0.5);
  const wingSpeculum = mat(0x2349a6, 0.5); // Blue-violet wing speculum
  const orangePaddles = mat(0xe87a1a, 0.6);
  const eyeDark = mat(0x111111, 0.2);

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  // Buoyant boat-like waterfowl body
  mesh(GEO.body, isBaby ? mat(0xcca338) : bodyGrey, body, [0, 0.52 * scale, 0], [0.65 * scale, 0.52 * scale, 1.05 * scale]);
  // Rich purplish-chestnut breast shield
  mesh(GEO.body, isBaby ? mat(0xe5c45e) : breastChestnut, body, [0, 0.56 * scale, 0.35 * scale], [0.55 * scale, 0.48 * scale, 0.65 * scale]);

  // Folded wings with iridescent blue-violet speculum bars!
  if (!isBaby) {
    for (const side of [-1, 1]) {
      const wing = mesh(GEO.body, bodyGrey, body, [side * 0.35 * scale, 0.56 * scale, -0.05 * scale], [0.15 * scale, 0.35 * scale, 0.85 * scale]);
      mesh(GEO.box, wingSpeculum, wing, [side * 0.08, 0, 0], [0.08, 0.18, 0.35]);
      mesh(GEO.box, neckWhite, wing, [side * 0.08, 0.12, 0], [0.08, 0.05, 0.35]);
    }
  }

  // Head & Neck
  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 0.95 * scale, 0.55 * scale);
  body.add(head);

  // Iridescent emerald head & neck
  const headColor = isBaby ? mat(0xa8852a) : drakeGreen;
  mesh(GEO.head, headColor, head, [0, 0, 0], [0.24 * scale, 0.28 * scale, 0.32 * scale]);

  // Crisp white neck ring collar!
  if (!isBaby) {
    mesh(GEO.body, neckWhite, head, [0, -0.16 * scale, 0], [0.22 * scale, 0.08 * scale, 0.24 * scale]);
  }

  // Bright yellow duck bill
  mesh(GEO.muzzle, billYellow, head, [0, -0.04 * scale, 0.34 * scale], [0.18 * scale, 0.08 * scale, 0.32 * scale]);

  // Dark eyes
  for (const side of [-1, 1]) {
    mesh(GEO.eye, eyeDark, head, [side * 0.11 * scale, 0.06 * scale, 0.12 * scale], [0.9, 0.9, 0.9]);
  }

  // Swept-up duck tail with curled black drake feather
  const tail = new THREE.Group();
  tail.name = 'tail-pivot';
  tail.position.set(0, 0.62 * scale, -0.55 * scale);
  body.add(tail);
  const tailMesh = mesh(GEO.tail, bodyGrey, tail, [0, 0.12 * scale, -0.18 * scale], [0.55 * scale, 0.65 * scale, 0.55 * scale]);
  tailMesh.rotation.x = -1.95;

  // 2 Real webbed paddle feet swimming underwater beneath the body!
  const legs: THREE.Group[] = [];
  for (const x of [-0.14, 0.14]) {
    const pivot = new THREE.Group();
    pivot.position.set(x * scale, 0.28 * scale, -0.08 * scale);
    body.add(pivot);

    // Leg bone underwater
    const leg = mesh(GEO.leg, orangePaddles, pivot, [0, -0.15 * scale, 0], [0.5 * scale, 0.6 * scale, 0.5 * scale]);
    leg.position.y = -0.16 * scale;
    // Webbed paddle foot
    mesh(GEO.muzzle, orangePaddles, pivot, [0, -0.32 * scale, 0.08 * scale], [0.22 * scale, 0.04 * scale, 0.28 * scale]);
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

function buildAnimalModel(
  species: Species,
  isBaby: boolean
): { root: THREE.Group; body: THREE.Group; legs: THREE.Group[]; head: THREE.Group; tail: THREE.Group } {
  if (species === 'deer') return buildDeerModel(isBaby);
  if (species === 'wolf') return buildWolfModel(isBaby);
  if (species === 'fox') return buildFoxModel(isBaby);
  if (species === 'boar') return buildBoarModel(isBaby);
  if (species === 'rabbit') return buildRabbitModel(isBaby);
  return buildDuckModel(isBaby);
}

export function isSharedAnimalAsset(resource: THREE.BufferGeometry | THREE.Material): boolean {
  return SHARED_ANIMAL_ASSETS.has(resource);
}

export class WildlifeSystem {
  readonly animals = new Map<string, AnimalState>();
  readonly trust: Record<string, number>;
  private readonly options: WildlifeOptions;
  private readonly size: number;
  private elapsed = 0;

  constructor(options: WildlifeOptions) {
    this.options = options;
    this.trust = options.trust;
    this.size = options.chunkSize;
  }

  spawnChunk(cx: number, cz: number, lod: number, parent: THREE.Group): void {
    if (lod >= 2) return;
    const count = lod === 0 ? 2 : 1;
    const size = this.size;
    const minX = cx * size + 1.6, maxX = (cx + 1) * size - 1.6;
    const minZ = cz * size + 1.6, maxZ = (cz + 1) * size - 1.6;

    for (let slot = 0; slot < count; slot++) {
      if (seeded(cx * 29 + slot * 7, cz * 37 - slot * 11) < (lod === 0 ? 0.58 : 0.8)) continue;

      const id = `${cx},${cz}:${slot}`;
      let x = 0, z = 0, kind: Species | null = null, habitat: Biome = 'meadow';

      for (let attempt = 0; attempt < 18; attempt++) {
        const r1 = seeded(cx * 101 + slot * 17 + attempt * 31, cz * 73 - slot * 23 + attempt * 7);
        const r2 = seeded(cx * 89 - slot * 13 + attempt * 19, cz * 107 + slot * 29 - attempt * 5);
        x = lerp(minX, maxX, r1);
        z = lerp(minZ, maxZ, r2);
        if (this.options.nearHome(x, z) || this.options.roadAt(x, z)) continue;
        habitat = this.options.biomeAt(x, z);
        kind = this.chooseSpecies(habitat, seeded(cx * 131 + slot * 47, cz * 149 - slot * 53));
        if (AQUATIC.has(kind) ? this.options.waterAt(x, z) : !this.options.waterAt(x, z)) break;
        kind = null;
      }

      if (!kind) continue;

      const isBaby = seeded(cx * 43 + slot * 19, cz * 67 + slot * 13) < 0.28;
      const rootData = buildAnimalModel(kind, isBaby);
      rootData.root.name = `wildlife-${id}`;
      rootData.root.userData.animal = { id, species: kind };
      rootData.root.userData.interactable = { action: 'animal', label: `${isBaby ? 'Young ' : ''}${SPECIES_NAME[kind]}` };
      rootData.root.userData.colliderRadius = (kind === 'duck' ? 0.28 : kind === 'rabbit' ? 0.34 : 0.48) * (isBaby ? 0.6 : 1);

      // Duck rests partially submerged at waterline so paddle feet are submerged
      const initialY = AQUATIC.has(kind) ? WATER_LEVEL - DUCK_WATER_OFFSET : this.options.heightAt(x, z);
      rootData.root.position.set(x, initialY, z);
      rootData.root.rotation.y = seeded(cx * 53 + slot, cz * 61 - slot) * Math.PI * 2;

      if (lod > 0) {
        rootData.root.traverse(o => {
          if (o instanceof THREE.Mesh) o.castShadow = false;
        });
      }

      parent.add(rootData.root);
      const initialTrust = clamp(this.trust[id] || 0, 0, 5);

      this.animals.set(id, {
        id,
        species: kind,
        biome: habitat,
        chunkKey: `${cx},${cz}`,
        root: rootData.root,
        body: rootData.body,
        legs: rootData.legs,
        head: rootData.head,
        tail: rootData.tail,
        home: new THREE.Vector2(x, z),
        target: new THREE.Vector2(x, z),
        think: 0.5 + seeded(slot + cx * 3, cz * 7) * 4,
        fleeCooldown: 0,
        mood: 'foraging',
        phase: seeded(cx * 11 + slot, cz * 13) * Math.PI * 2,
        direction: rootData.root.rotation.y,
        trust: initialTrust,
        isBaby,
        scale: isBaby ? 0.55 : 1.0,
      });
    }
  }

  private chooseSpecies(biome: Biome, roll: number): Species {
    const pools: Record<Biome, Species[]> = {
      meadow: ['deer', 'rabbit', 'rabbit', 'fox', 'boar'],
      forest: ['deer', 'deer', 'rabbit', 'fox', 'wolf', 'boar'],
      wetland: ['duck', 'duck', 'boar', 'deer', 'rabbit'],
      alpine: ['deer', 'wolf', 'wolf', 'fox', 'rabbit'],
      shore: ['duck', 'duck', 'rabbit', 'fox'],
      riverbank: ['duck', 'deer', 'rabbit', 'fox'],
    };
    const pool = pools[biome];
    return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
  }

  removeChunk(key: string): void {
    for (const [id, animal] of this.animals) {
      if (animal.chunkKey === key) this.animals.delete(id);
    }
  }

  update(dt: number, playerPos: THREE.Vector3, sprinting: boolean): void {
    this.elapsed += dt;

    for (const a of this.animals.values()) {
      const p = a.root.position;
      const dx = playerPos.x - p.x;
      const dz = playerPos.z - p.z;
      const distance = Math.hypot(dx, dz);
      const trust = a.trust;

      a.fleeCooldown = Math.max(0, a.fleeCooldown - dt);
      const notice = (a.species === 'wolf' ? 12 : a.species === 'deer' ? 9.5 : 7.5) + trust * 0.7;
      const close = distance < (trust >= 2 ? 1.5 : 2.8);

      if (
        distance < notice &&
        FLEEING.has(a.species) &&
        (sprinting || trust < 2 || close) &&
        a.mood !== 'fleeing' &&
        a.fleeCooldown <= 0
      ) {
        const inv = 1 / Math.max(distance, 0.001);
        const fleeDist = a.species === 'rabbit' || a.species === 'duck' ? 6.5 : 9.0;
        a.target.set(p.x - dx * inv * fleeDist, p.z - dz * inv * fleeDist);
        a.mood = 'fleeing';
        a.think = 1.6;
        a.fleeCooldown = 3.2;
      } else if (distance < notice && trust >= 1 && a.mood !== 'fleeing') {
        a.mood = 'curious';
      }

      a.think -= dt;
      if (a.think <= 0 && a.mood !== 'fleeing') {
        this.chooseNextTarget(a);
      }
      if (a.think <= 0 && a.mood === 'fleeing') {
        a.mood = trust >= 2 && distance < notice ? 'curious' : 'alert';
      }

      const tx = a.target.x - p.x;
      const tz = a.target.y - p.z;
      const remaining = Math.hypot(tx, tz);
      const moving = remaining > 0.22 && a.mood !== 'drinking' && a.mood !== 'sleeping';

      if (moving) {
        const desired = Math.atan2(tx, tz);
        a.direction += Math.atan2(Math.sin(desired - a.direction), Math.cos(desired - a.direction)) * Math.min(1, dt * 5.2);
        const baseSpeed =
          a.mood === 'fleeing' ? (a.species === 'rabbit' ? 6.0 : 4.8) : a.species === 'duck' ? 0.8 : 0.95 + a.trust * 0.05;
        const step = Math.min(remaining, baseSpeed * dt);
        const nx = p.x + Math.sin(a.direction) * step;
        const nz = p.z + Math.cos(a.direction) * step;

        if (this.canStand(a.species, nx, nz, a.home, a.chunkKey)) {
          p.x = nx;
          p.z = nz;
          p.y = AQUATIC.has(a.species) ? WATER_LEVEL - DUCK_WATER_OFFSET : this.options.heightAt(nx, nz);
        } else {
          a.think = 0;
          a.target.copy(a.home);
        }
      }

      a.root.rotation.y = a.direction;

      const gait = this.elapsed * (a.mood === 'fleeing' ? 14 : 6.2) + a.phase;

      if (AQUATIC.has(a.species)) {
        // Floating duck gentle water bobbing
        const waterBob = Math.sin(this.elapsed * 2.2 + a.phase) * 0.018;
        a.body.position.y = waterBob;
        // Duck legs paddle rhythmically underwater
        for (let leg = 0; leg < a.legs.length; leg++) {
          a.legs[leg].rotation.x = moving ? Math.sin(gait + (leg % 2) * Math.PI) * 0.55 : Math.sin(this.elapsed * 1.5) * 0.1;
        }
      } else {
        if (moving && a.mood === 'fleeing' && (a.species === 'deer' || a.species === 'rabbit')) {
          const leap = Math.abs(Math.sin(gait * 0.5)) * (a.species === 'deer' ? 0.38 : 0.24);
          a.body.position.y = leap;
        } else {
          a.body.position.y = Math.sin(this.elapsed * 2.4 + a.phase) * (moving ? 0.03 : 0.014);
        }

        for (let leg = 0; leg < a.legs.length; leg++) {
          a.legs[leg].rotation.x = moving
            ? Math.sin(gait + (leg % 2) * Math.PI) * (a.mood === 'fleeing' ? 0.72 : 0.38)
            : 0;
        }
      }

      // Head & tail motions
      if (a.mood === 'sleeping') {
        a.body.position.y = -0.22 * a.scale;
        a.head.rotation.x = 0.3;
      } else if (a.mood === 'drinking') {
        a.head.rotation.x = 0.55 + Math.sin(this.elapsed * 3.5) * 0.08;
      } else if (a.mood === 'foraging') {
        a.head.rotation.x = 0.42 + Math.sin(this.elapsed * 2.0) * 0.12;
      } else if (a.mood === 'curious') {
        a.head.rotation.z = Math.sin(this.elapsed * 2.5) * 0.18;
        a.head.rotation.x = -0.15;
      } else {
        a.head.rotation.x = Math.sin(this.elapsed * 1.8 + a.phase) * 0.05;
      }

      a.tail.rotation.y = Math.sin(this.elapsed * (a.mood === 'curious' ? 6.5 : 3.8) + a.phase) * 0.22;
    }
  }

  private canStand(species: Species, x: number, z: number, home: THREE.Vector2, chunkKey: string): boolean {
    const [cx, cz] = chunkKey.split(',').map(Number);
    const size = this.size;
    if (x < cx * size + 1 || x > (cx + 1) * size - 1 || z < cz * size + 1 || z > (cz + 1) * size - 1) return false;
    if (this.options.nearHome(x, z) || this.options.roadAt(x, z)) return false;
    const wet = this.options.waterAt(x, z);
    return AQUATIC.has(species) ? wet : !wet && Math.hypot(x - home.x, z - home.y) < 12;
  }

  private chooseNextTarget(a: AnimalState): void {
    const [cx, cz] = a.chunkKey.split(',').map(Number);
    const size = this.size;
    const turn = Math.floor(this.elapsed / 5 + a.phase * 3);

    for (let attempt = 0; attempt < 10; attempt++) {
      const r1 = seeded(Math.round(a.home.x * 19) + turn + attempt * 7, Math.round(a.home.y * 23) - turn * 3);
      const r2 = seeded(Math.round(a.home.x * 29) - turn * 5, Math.round(a.home.y * 31) + turn + attempt * 11);
      const radius = a.species === 'rabbit' ? 5.0 : 7.5;
      const angle = r1 * Math.PI * 2, distance = 0.8 + r2 * radius;
      const x = clamp(a.home.x + Math.sin(angle) * distance, cx * size + 1.5, (cx + 1) * size - 1.5);
      const z = clamp(a.home.y + Math.cos(angle) * distance, cz * size + 1.5, (cz + 1) * size - 1.5);

      if (this.canStand(a.species, x, z, a.home, a.chunkKey)) {
        a.target.set(x, z);
        const nearWater = this.options.waterAt(x + 2, z) || this.options.waterAt(x - 2, z) || this.options.waterAt(x, z + 2) || this.options.waterAt(x, z - 2);
        if (nearWater && !AQUATIC.has(a.species) && r1 < 0.35) {
          a.mood = 'drinking';
        } else if (r1 < 0.18) {
          a.mood = 'resting';
        } else if (r1 < 0.55) {
          a.mood = 'foraging';
        } else {
          a.mood = 'wandering';
        }
        a.think = 2.4 + r2 * 5.5;
        return;
      }
    }

    a.target.copy(a.home);
    a.mood = 'resting';
    a.think = 2.5;
  }

  interact(root: THREE.Object3D): void {
    const data = root.userData.animal as { id: string; species: Species } | undefined;
    if (!data) return;
    const a = this.animals.get(data.id);
    if (!a) return;
    const name = `${a.isBaby ? 'Young ' : ''}${SPECIES_NAME[a.species]}`;

    if (this.options.hasFruit() && !AQUATIC.has(a.species) && a.species !== 'wolf' && a.trust < 5) {
      this.options.consumeFruit();
      a.trust = Math.min(5, a.trust + 1);
      this.trust[a.id] = a.trust;
      a.mood = 'curious';
      a.think = 3.0;
      this.options.onTrustChange();
      const label = a.trust >= 4 ? 'nuzzles close and trusts you deeply' : 'eats peacefully from your hand';
      this.options.notify(`Offered sweet fruit. The ${name.toLowerCase()} ${label}!`);
      return;
    }

    const note =
      a.species === 'deer'
        ? 'Browses tender shoots, tilting its head toward you gently.'
        : a.species === 'rabbit'
        ? 'Nose wiggling, whiskers twitching softly in the grass.'
        : a.species === 'fox'
        ? 'Amber eyes study you curiously, bushy tail curled with white tip.'
        : a.species === 'wolf'
        ? 'Stands tall and surveys the windswept ridge with keen senses.'
        : a.species === 'boar'
        ? 'Snuffles through the rich earth finding fallen roots with its rooting disc and tusks.'
        : 'Paddles serenely across the water surface, orange feet paddling underneath.';

    this.options.notify(`${name} · ${note}${this.options.hasFruit() ? '' : ' (Collect fruit to feed and tame!)'}`);
  }

  status(playerPos: THREE.Vector3): string {
    let nearest: AnimalState | null = null, best = 26;
    for (const a of this.animals.values()) {
      const d = Math.hypot(a.root.position.x - playerPos.x, a.root.position.z - playerPos.z);
      if (d < best) {
        best = d;
        nearest = a;
      }
    }
    const nearby = [...this.animals.values()].filter(
      a => Math.hypot(a.root.position.x - playerPos.x, a.root.position.z - playerPos.z) < 38
    ).length;

    return nearest
      ? `${SPECIES_ICON[nearest.species]} ${nearest.isBaby ? 'Young ' : ''}${SPECIES_NAME[nearest.species]} · ${nearest.mood} · ${nearby} in area`
      : `Wildlife · ${nearby} nearby`;
  }

  markers(): AnimalMarker[] {
    return [...this.animals.values()].map(a => ({
      x: a.root.position.x,
      z: a.root.position.z,
      species: a.species,
      isBaby: a.isBaby,
    }));
  }
}

export const speciesColor = (species: Species): string => `#${SPECIES_COLOR[species].toString(16).padStart(6, '0')}`;
