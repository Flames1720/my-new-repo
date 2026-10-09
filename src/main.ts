import * as THREE from 'three';
import './style.css';
import type { Mode, EmoteKind, HomeLevel, ResourceKind, ResourceDef, PlayerProfile, Species, CharacterModelId } from './types';
import {
  SEED,
  SIZE,
  WORLD_RADIUS,
  WORLD_DIAMETER,
  WATER_LEVEL,
  ROAD_SPACING,
  ROAD_WIDTH,
  HOME_X,
  HOME_Z,
  HOME_BASE_HEIGHT,
  VILLAGE_X,
  VILLAGE_Z,
  terrainHeightAt,
  waterDepthAt,
  waterSurfaceAt,
  waterAt,
  waterFlowAt,
  biomeAt,
  terrainColorAt,
  mountainMaskAt,
  queryWorldFields,
  terrainSlopeAt,
  roadAt,
  isRiverAt,
  isBridgeAt,
  nearHome,
  nearVillage,
  hash,
  clamp,
  lerp,
} from './terrain';
import { isCharacterModelId, PLAYER_CHARACTER_MODELS, PlayerCharacter } from './character';
import { createMagicBurst, disposeMagicEffect, MagicProjectileEffect, type MagicElement } from './magic-effects';
import { WeatherSystem } from './weather';
import { buildHome, buildVillage, buildBridge, HOME_UPGRADE_COSTS } from './settlement';
import { WildlifeSystem, isSharedAnimalAsset, speciesColor, SPECIES_NAME, SPECIES_ICON } from './fauna';
import { MinimapSystem } from './minimap';
import { settings } from './settings';
import { WorldSurvey, type SurveyView } from './survey';
import { voxelWorld, buildVoxelWorldVolumeMesh, buildVoxelWorldWaterVolumeMesh, type VoxelEdit } from './voxel';
import { environmentAssets } from './environment-assets';
import { ZombieSurvivalSystem, type SurvivalStatus } from './zombie-survival';

type Save = {
  version: 2;
  player: { x: number; y: number; z: number; ry: number; mode: Mode };
  camera: { yaw: number; pitch: number; distance: number };
  changes: Record<string, string[]>;
  inventory: Record<string, number>;
  wildlifeTrust?: Record<string, number>;
  worldTime?: number;
  homeLevel?: HomeLevel;
  voxelEdits?: VoxelEdit[];
};

const IS_TOUCH_DEVICE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const LOW_POWER_MODE = IS_TOUCH_DEVICE || (navigator.hardwareConcurrency || 4) <= 4;
const SAVE_KEY = 'virtual-family-core-v2';

const angleLerp = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, t);

// --- RESOURCE DEFINITIONS ---
const RESOURCE_DEFS: Record<ResourceKind, ResourceDef> = {
  oak: { family: 'tree', hitsToFell: 3, regrowSeconds: 180, colliderRadius: 0.72, yieldItem: 'Wood', yieldQty: [2, 4], trunkColor: 0x694b35, crownColor: 0x3d7148 },
  ancient_oak: { family: 'tree', hitsToFell: 6, regrowSeconds: 320, colliderRadius: 1.45, yieldItem: 'Wood', yieldQty: [6, 12], bonusItem: 'Fruit', bonusQty: [2, 5], trunkColor: 0x513824, crownColor: 0x2e5c38 },
  pine: { family: 'tree', hitsToFell: 2, regrowSeconds: 140, colliderRadius: 0.6, yieldItem: 'Pine Wood', yieldQty: [1, 3], trunkColor: 0x5b4330, crownColor: 0x2e5c3e },
  fruit: { family: 'tree', hitsToFell: 4, regrowSeconds: 220, colliderRadius: 0.72, yieldItem: 'Wood', yieldQty: [1, 3], bonusItem: 'Fruit', bonusQty: [2, 5], trunkColor: 0x6b4a32, crownColor: 0x4a7a3f, fruitColor: 0xcc4433 },
  palm: { family: 'tree', hitsToFell: 3, regrowSeconds: 200, colliderRadius: 0.55, yieldItem: 'Palm Wood', yieldQty: [1, 2], trunkColor: 0x8a6a3f, crownColor: 0x4f8a3d },
  rock: { family: 'rock', hitsToFell: 3, regrowSeconds: Infinity, colliderRadius: 0.55, yieldItem: 'Stone', yieldQty: [2, 4], rockColor: 0x8c8f93 },
  boulder: { family: 'rock', hitsToFell: 6, regrowSeconds: Infinity, colliderRadius: 0.95, yieldItem: 'Stone', yieldQty: [5, 9], bonusItem: 'Ore', bonusQty: [1, 2], rockColor: 0x6f7378 },
};

const ITEM_ICONS: Record<string, string> = {
  Wood: '🪵',
  'Pine Wood': '🪵',
  'Palm Wood': '🪵',
  Fruit: '🍎',
  Stone: '🪨',
  Ore: '⛏️',
};

function pickTreeKind(cx: number, cz: number, i: number, tx: number, tz: number): ResourceKind {
  const nearShore = waterAt(tx + 3.5, tz) || waterAt(tx - 3.5, tz) || waterAt(tx, tz + 3.5) || waterAt(tx, tz - 3.5);
  if (nearShore) return 'palm';

  const roll = hash(cx * 53 + i * 11, cz * 59 - i * 13);
  const pineChunk = hash(cx * 31 + 7, cz * 37 - 7) < 0.35;

  if (pineChunk) return roll < 0.82 ? 'pine' : roll < 0.92 ? 'fruit' : 'ancient_oak';
  if (roll < 0.08) return 'ancient_oak';
  if (roll < 0.22) return 'fruit';
  if (roll < 0.38) return 'pine';
  return 'oak';
}

function buildTree(kind: ResourceKind, lod: number): THREE.Group {
  const assetTree = environmentAssets.createTree(kind, lod);
  if (assetTree) {
    const def = RESOURCE_DEFS[kind];
    if (kind === 'fruit') {
      const fruitMat = new THREE.MeshStandardMaterial({ color: def.fruitColor ?? 0xcc4433, roughness: 0.6 });
      for (let f = 0; f < 5; f++) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), fruitMat);
        const a = f * ((Math.PI * 2) / 5);
        fruit.position.set(Math.cos(a) * 1.05, 2.2 + Math.sin(f * 1.7) * 0.28, Math.sin(a) * 1.05);
        assetTree.add(fruit);
      }
    }
    if (lod === 0) {
      assetTree.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
    }
    return assetTree;
  }

  // Lightweight deterministic fallback while the CC0 asset pack is loading.
  const g = new THREE.Group();
  const def = RESOURCE_DEFS[kind];
  const trunkMat = new THREE.MeshStandardMaterial({ color: def.trunkColor, roughness: 0.95 });
  const crownMat = new THREE.MeshStandardMaterial({ color: def.crownColor, roughness: 0.88 });

  if (kind === 'palm') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.6, lod === 0 ? 8 : 5), trunkMat);
    trunk.position.y = 1.3;
    g.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 4), crownMat);
      const a = f * ((Math.PI * 2) / 5);
      frond.position.set(Math.cos(a) * 0.5, 2.6, Math.sin(a) * 0.5);
      frond.rotation.z = Math.PI / 2.1;
      frond.rotation.y = a;
      g.add(frond);
    }
  } else if (kind === 'pine') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.8, lod === 0 ? 8 : 5), trunkMat);
    trunk.position.y = 0.9;
    g.add(trunk);
    for (let t = 0; t < 4; t++) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(1.0 - t * 0.2, 1.2, lod === 0 ? 8 : 5), crownMat);
      tier.position.y = 1.6 + t * 0.8;
      g.add(tier);
    }
  } else if (kind === 'ancient_oak') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, 3.2, lod === 0 ? 10 : 6), trunkMat);
    trunk.position.y = 1.6;
    g.add(trunk);
    for (let r = 0; r < 4; r++) {
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 1.2, 5), trunkMat);
      const ra = r * (Math.PI / 2);
      root.position.set(Math.cos(ra) * 0.45, 0.4, Math.sin(ra) * 0.45);
      root.rotation.z = 0.35;
      root.rotation.y = ra;
      g.add(root);
    }
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(2.3, lod === 0 ? 10 : 6, lod === 0 ? 8 : 5), crownMat);
    c1.position.set(0, 3.8, 0);
    g.add(c1);
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(1.6, lod === 0 ? 8 : 5, lod === 0 ? 6 : 4), crownMat);
    c2.position.set(1.1, 4.2, -0.6);
    g.add(c2);
    const c3 = new THREE.Mesh(new THREE.SphereGeometry(1.5, lod === 0 ? 8 : 5, lod === 0 ? 6 : 4), crownMat);
    c3.position.set(-1.0, 4.0, 0.8);
    g.add(c3);
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.7, lod === 0 ? 8 : 5), trunkMat);
    trunk.position.y = 0.85;
    g.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.15, lod === 0 ? 9 : 5, lod === 0 ? 7 : 4), crownMat);
    crown.position.y = 2.1;
    g.add(crown);
    if (kind === 'fruit') {
      const fruitMat = new THREE.MeshStandardMaterial({ color: def.fruitColor, roughness: 0.6 });
      for (let f = 0; f < 6; f++) {
        const fr = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), fruitMat);
        const a = f * ((Math.PI * 2) / 6);
        fr.position.set(Math.cos(a) * 0.95, 2.1 + Math.sin(f) * 0.35, Math.sin(a) * 0.95);
        g.add(fr);
      }
    }
  }
  if (lod === 0) {
    g.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
  return g;
}
function buildRock(kind: ResourceKind, lod: number): THREE.Group {
  const assetRock = environmentAssets.createRock(kind, lod);
  if (assetRock) {
    if (lod === 0) {
      assetRock.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
    }
    return assetRock;
  }

  const g = new THREE.Group();
  const def = RESOURCE_DEFS[kind];
  const mat = new THREE.MeshStandardMaterial({ color: def.rockColor, roughness: 1, flatShading: true });
  const base = kind === 'boulder' ? 1.15 : 0.6;
  const geo = new THREE.IcosahedronGeometry(base, lod === 0 ? 1 : 0);
  const gp = geo.getAttribute('position');
  for (let i = 0; i < gp.count; i++) {
    const j = (hash(Math.round(gp.getX(i) * 97 + i * 13), Math.round(gp.getZ(i) * 131 - i * 7)) - 0.5) * 0.25;
    gp.setXYZ(i, gp.getX(i) * (1 + j), gp.getY(i) * (1 + j * 0.6), gp.getZ(i) * (1 + j));
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, mat);
  rock.position.y = base * 0.55;
  g.add(rock);
  if (lod === 0) {
    g.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
  return g;
}
// --- SHADERS & WATER ---
// Water reads as a volume, not a sheet: transparency and colour are driven by
// the real per-vertex water depth (aDepth), so shallows show the bed, deep
// water darkens, and the shoreline fades to foam instead of ending in a hard edge.
const waterMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  transparent: true,
  opacity: 1,
  roughness: 0.08,
  metalness: 0.08,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const waterfallMaterial = new THREE.MeshStandardMaterial({
  color: 0xdaf5ff,
  transparent: true,
  opacity: 0.58,
  roughness: 0.08,
  metalness: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const springMaterial = new THREE.MeshStandardMaterial({
  color: 0x9deee4,
  transparent: true,
  opacity: 0.68,
  roughness: 0.08,
  metalness: 0.02,
  depthWrite: false,
  side: THREE.DoubleSide,
});

let waterShader: {
  uniforms: {
    uTime: { value: number };
    uWaveHeight: { value: number };
    uWindDir: { value: THREE.Vector2 };
  };
} | null = null;

// x/z = player world position, z component of the vector = wake strength (0 when dry).
// Shared by reference with the water shader so update() only mutates it.
const waterWake = new THREE.Vector3(0, 0, 0);

waterMaterial.onBeforeCompile = shader => {
  shader.uniforms.uTime = { value: 0 };
  shader.uniforms.uWaveHeight = { value: 0.04 };
  shader.uniforms.uWindDir = { value: new THREE.Vector2(0.7071, -0.7071) };
  shader.uniforms.uPlayer = { value: waterWake };
  shader.vertexShader = `
    uniform float uTime;
    uniform float uWaveHeight;
    uniform vec2 uWindDir;
    attribute float aDepth;
    attribute vec2 aFlow;
    varying float vDepth;
    varying vec2 vFlow;
    varying vec3 vWorldPos;
  ` + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    vec4 ripplePos = modelMatrix * vec4(transformed, 1.0);
    vDepth = aDepth;
    vFlow = aFlow;
    // Swell fades out toward the shore (by real depth) so the waterline stays
    // anchored to the bank instead of lifting off it.
    float shoreDamping = smoothstep(0.08, 0.7, aDepth);
    float windDot = dot(ripplePos.xz, uWindDir);
    float wave1 = sin(windDot * 0.55 + uTime * 1.3) * uWaveHeight;
    float wave2 = cos(ripplePos.x * 0.75 + ripplePos.z * 0.35 - uTime * 0.85) * (uWaveHeight * 0.45);
    float wave = (wave1 + wave2) * shoreDamping;
    transformed.y += wave;
    vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
  );

  shader.fragmentShader = `
    uniform float uTime;
    uniform float uWaveHeight;
    uniform vec3 uPlayer;
    varying float vDepth;
    varying vec2 vFlow;
    varying vec3 vWorldPos;
  ` + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
    // Flow-advected ripple normals: glints and motion without moving the geometry.
    vec2 wp = vWorldPos.xz - vFlow * uTime * 0.5;
    float ph1 = wp.x * 1.9 + wp.y * 1.3 + uTime * 0.9;
    float ph2 = wp.x * 3.7 - wp.y * 2.9 - uTime * 1.4;
    vec2 rip = vec2(
      cos(ph1) * 1.9 + cos(ph2) * 3.7,
      cos(ph1) * 1.3 - cos(ph2) * 2.9
    );
    rip *= 0.010 * (0.6 + uWaveHeight * 8.0);

    // Player wake: expanding rings around whoever is wading or swimming.
    vec2 pd = vWorldPos.xz - uPlayer.xy;
    float pr = length(pd);
    float wake = sin(pr * 9.0 - uTime * 6.0) * exp(-pr * 0.8) * uPlayer.z;
    rip += (pd / max(pr, 0.001)) * wake * 0.25;

    rip *= smoothstep(0.02, 0.3, vDepth);
    normal = normalize(normal + (viewMatrix * vec4(rip.x, 0.0, rip.y, 0.0)).xyz);

    // Fresnel: grazing views reflect more, looking straight down shows the bed.
    float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);

    // Shore foam + white water in fast flow.
    float edge = 1.0 - smoothstep(0.0, 0.30, vDepth);
    float breakup = 0.5 + 0.5 * sin(wp.x * 5.3 + uTime * 1.1) * sin(wp.y * 4.7 - uTime * 0.9);
    float rapids = clamp((length(vFlow) - 1.8) * 0.35, 0.0, 0.6);
    float foam = clamp(edge * (0.45 + 0.55 * breakup) + rapids * breakup * 0.7, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.98, 1.0), foam * 0.85);

    // Depth-driven transparency: clear shallows, dense deep water, soft shoreline.
    float body = mix(0.30, 0.93, smoothstep(0.0, 1.8, vDepth));
    float alpha = clamp(body + fres * 0.45, 0.0, 0.97);
    alpha *= smoothstep(0.0, 0.07, vDepth);
    alpha = max(alpha, foam * 0.8 * smoothstep(0.0, 0.03, vDepth));
    diffuseColor.a = alpha;`
  );
  waterShader = shader as any;
};

// --- TERRAIN GPU DISPLACEMENT MATERIAL ---
const terrainMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.98,
  metalness: 0.02,
});

let terrainShader: { uniforms: { uTime: { value: number }; uDispScale: { value: number } } } | null = null;
terrainMaterial.onBeforeCompile = shader => {
  shader.uniforms.uTime = { value: 0 };
  shader.uniforms.uDispScale = { value: settings.current.lodDetail === 'fast' ? 0.0 : settings.current.lodDetail === 'balanced' ? 0.5 : 1.0 };
  shader.vertexShader = `
    uniform float uTime;
    uniform float uDispScale;
    attribute float aWaterMask;
    attribute float aWaterDepth;
    varying float vBedDepth;
  ` + shader.vertexShader;

  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    float wx = worldPos.x;
    float wz = worldPos.z;
    float wy = worldPos.y;

    // GPU-accelerated micro-displacement for soaring alpine crags and ridges
    float isMtn = clamp((wy - 14.0) / 12.0, 0.0, 1.0);
    float mtnDisp = (sin(wx * 0.28 + wz * 0.22) * 0.52 + cos(wx * 0.42 - wz * 0.35) * 0.42) * isMtn;
    // Keep high-altitude water beds tied to the authoritative carved surface.
    mtnDisp *= 1.0 - smoothstep(0.0, 0.42, aWaterMask);

    // Riverbed & shoreline alluvial sediment displacement
    float isRiverbed = clamp((1.8 - wy) / 1.5, 0.0, 1.0);
    float riverDisp = (sin(wx * 0.65 + wz * 0.55) * 0.07) * isRiverbed;
    // Do not perturb an authoritative wet bed back through its water surface.
    riverDisp *= 1.0 - smoothstep(0.0, 0.42, aWaterMask);

    transformed.y += (mtnDisp + riverDisp) * uDispScale;
    vBedDepth = aWaterDepth;
    `
  );

  // Light absorption: the submerged bed turns teal and darkens with depth,
  // which is what makes the water above it read as a body with thickness.
  shader.fragmentShader = `
    varying float vBedDepth;
  ` + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
    float bedWet = smoothstep(0.0, 0.25, vBedDepth);
    float bedAbsorb = smoothstep(0.0, 2.2, vBedDepth);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.38, 0.72, 0.78), bedWet * 0.55);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.17, 0.22), bedAbsorb * 0.65);`
  );
  terrainShader = shader as any;
};

// --- SCENE SETUP ---
const scene = new THREE.Scene();
const skyColor = new THREE.Color(0x9fc7df);
scene.background = skyColor;
scene.fog = new THREE.Fog(0x9fc7df, 140, 950);
const gameplayFog = scene.fog;

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 1200);
const renderer = new THREE.WebGLRenderer({ antialias: !LOW_POWER_MODE, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW_POWER_MODE ? 1.25 : 1.65));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LOW_POWER_MODE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.querySelector('#game')!.appendChild(renderer.domElement);

const hemisphere = new THREE.HemisphereLight(0xdceeff, 0x405044, 2.2);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(0xfff0d0, 3.0);
sun.position.set(35, 70, 25);
sun.castShadow = !LOW_POWER_MODE;
sun.shadow.mapSize.set(LOW_POWER_MODE ? 512 : 1024, LOW_POWER_MODE ? 512 : 1024);
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
scene.add(sun, sun.target);

// --- CELESTIAL BODIES: VISUAL SUN, MOON & TWINKLING STARS ---
const celestialGroup = new THREE.Group();
celestialGroup.name = 'celestial-system';
scene.add(celestialGroup);

// Luminous Sun with golden corona
const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(26, 16, 16), sunMat);
const sunCoronaMat = new THREE.MeshBasicMaterial({ color: 0xffdf88, transparent: true, opacity: 0.5, side: THREE.BackSide });
const sunCorona = new THREE.Mesh(new THREE.SphereGeometry(38, 16, 16), sunCoronaMat);
sunDisc.add(sunCorona);
celestialGroup.add(sunDisc);

// Ethereal Moon with soft silver lunar glow
const moonMat = new THREE.MeshBasicMaterial({ color: 0xddeaff });
const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 16), moonMat);
const moonGlowMat = new THREE.MeshBasicMaterial({ color: 0x9bc8ff, transparent: true, opacity: 0.38, side: THREE.BackSide });
const moonGlow = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 16), moonGlowMat);
moonDisc.add(moonGlow);
celestialGroup.add(moonDisc);

// Twinkling Starfield visible at dusk and night
const starCount = 650;
const starGeo = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 0.9 + 0.05); // Upper celestial hemisphere
  const r = 900;
  starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.cos(phi);
  starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.5, transparent: true, opacity: 0 });
const starPoints = new THREE.Points(starGeo, starMat);
celestialGroup.add(starPoints);

// --- DISTANT MOUNTAIN HORIZON SKYLINE MESH ---
// Renders the silhouette of distant mountain ranges and peaks in line of sight with zero chunk overhead
function createDistantHorizon(): THREE.Mesh {
  const segs = 56;
  const span = 920; // 920m width covering the entire world horizons
  const geo = new THREE.PlaneGeometry(span, span, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i);
    const wz = pos.getZ(i);
    const h = terrainHeightAt(wx, wz);
    pos.setY(i, h);
    const b = biomeAt(wx, wz);
    const c = terrainColorAt(h, wx, wz, b);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'distant-horizon-skyline';
  return mesh;
}
const distantHorizonMesh = createDistantHorizon();
scene.add(distantHorizonMesh);

const daySky = new THREE.Color(0x9fc7df);
const nightSky = new THREE.Color(0x182436);
const twilightSky = new THREE.Color(0xc78b76);
const underwaterFogColor = new THREE.Color(0x15566b);
const rainySky = new THREE.Color(0x566775);

let skyTimer = 0;
let underwater = false;

const weather = new WeatherSystem(scene);

function updateSky(dt: number, rainDim: number, lightningFlash: number) {
  skyTimer += dt;
  if (skyTimer < 0.15) return;
  skyTimer = 0;

  const angle = ((worldTime - 6) * Math.PI) / 12;
  const daylight = clamp(Math.sin(angle), 0, 1);
  const twilight = clamp(1 - Math.abs(Math.sin(angle)) / 0.45, 0, 1);

  skyColor.copy(nightSky).lerp(daySky, daylight).lerp(twilightSky, twilight * 0.72);
  if (rainDim > 0) skyColor.lerp(rainySky, rainDim);

  if (lightningFlash > 0) {
    skyColor.lerp(new THREE.Color(0xddeeff), lightningFlash * 0.85);
  }

  // Atmospheric Fog: Expanded range so distant mountains remain majestic silhouettes on the horizon
  if (scene.fog) {
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(underwater ? underwaterFogColor : skyColor);
    fog.near = underwater ? 1.5 : rainDim > 0.5 ? 40 : 130;
    fog.far = underwater ? 22 : rainDim > 0.5 ? 240 : 950;
  }

  hemisphere.intensity = (0.45 + daylight * 1.65) * (1 - rainDim * 0.4) + lightningFlash * 1.2;
  sun.intensity = (0.12 + daylight * 2.85 + twilight * 0.35) * (1 - rainDim * 0.65);
  sun.color.set(twilight > 0.1 ? 0xffbc8b : daylight > 0.18 ? 0xfff0d0 : 0x9bb4dd);

  // Position Sun & Moon along celestial circular orbit
  const orbitDist = 720;
  const px = player.root.position.x;
  const py = player.root.position.y;
  const pz = player.root.position.z;

  const sunX = px + Math.cos(angle) * orbitDist;
  const sunY = py + Math.sin(angle) * orbitDist;
  const sunZ = pz + 90;
  sunDisc.position.set(sunX, sunY, sunZ);
  sun.position.set(sunX, sunY, sunZ);
  sun.target.position.copy(player.root.position);

  // Moon travels opposite to the sun
  const moonX = px - Math.cos(angle) * orbitDist;
  const moonY = py - Math.sin(angle) * orbitDist;
  const moonZ = pz - 90;
  moonDisc.position.set(moonX, moonY, moonZ);

  // Sunrise/Sunset colors on celestial sun disc & corona
  if (twilight > 0.15) {
    sunMat.color.set(0xff8c55); // Rich amber dawn/dusk
    sunCoronaMat.color.set(0xff5533);
  } else {
    sunMat.color.set(0xfffae0); // Golden daylight
    sunCoronaMat.color.set(0xffdf88);
  }

  // Starfield shines bright in the night sky and fades during day
  starMat.opacity = clamp((1 - daylight * 1.4) * 0.88 - rainDim * 0.75, 0, 0.88);
}

// --- SCATTERED HIGH CLOUDS ---
// Separated overlapping puffs replace the opaque-looking world-sized sheet.
const cloudDeckGroup = new THREE.Group();
cloudDeckGroup.name = 'scattered-sky-clouds';
const cloudDeckMat = new THREE.MeshBasicMaterial({
  color: 0xf4f8fc, transparent: true, opacity: 0.20, depthWrite: false, fog: false,
});
const cloudPuffGeo = new THREE.SphereGeometry(1, LOW_POWER_MODE ? 7 : 10, LOW_POWER_MODE ? 5 : 7);
for (let i = 0; i < 11; i++) {
  const cluster = new THREE.Group();
  const angle = i * 2.399963;
  const radius = 125 + ((i * 71) % 245);
  cluster.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  cluster.rotation.y = angle * 0.7;
  for (let p = 0, count = 3 + (i % 3); p < count; p++) {
    const puff = new THREE.Mesh(cloudPuffGeo, cloudDeckMat);
    const spread = p === 0 ? 0 : 9 + ((i * 7 + p * 11) % 15);
    const a = p * 2.4 + i * 0.53;
    puff.position.set(Math.cos(a) * spread, (p % 2) * 1.8, Math.sin(a) * spread);
    puff.scale.set(13 + ((i * 5 + p * 7) % 19), 4.5 + ((i + p * 3) % 5), 8 + ((i * 3 + p * 9) % 13));
    cluster.add(puff);
  }
  cloudDeckGroup.add(cluster);
}
scene.add(cloudDeckGroup);

const world = new THREE.Group(), actors = new THREE.Group();
scene.add(world, actors);

const voxelSurveyGroup = new THREE.Group();
voxelSurveyGroup.name = 'voxel-survey-volume';
voxelSurveyGroup.visible = false;
scene.add(voxelSurveyGroup);

// Survey deliberately switches from the gameplay surface meshes to the
// volumetric terrain/water representation, so the inspection view cannot
// accidentally hide the physical depth behind the old sheets.
const surveyHiddenSurfaceMeshes = new Set<THREE.Object3D>();
function setSurveySurfaceMeshesVisible(visible: boolean) {
  if (!visible) {
    world.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.name === 'terrain' || o.name === 'water-surface') {
        o.visible = false;
        surveyHiddenSurfaceMeshes.add(o);
      }
    });
    return;
  }

  for (const o of surveyHiddenSurfaceMeshes) o.visible = true;
  surveyHiddenSurfaceMeshes.clear();
}

const survey = new WorldSurvey();
scene.add(survey.root);
survey.setWorldScene(scene, camera);

const splashMaterial = new THREE.MeshBasicMaterial({ color: 0xb7e5d8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
const splashRing = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), splashMaterial);
splashRing.rotation.x = -Math.PI / 2;
splashRing.visible = false;
scene.add(splashRing);
let splashAge = 1;

function waterSplash(x: number, z: number) {
  splashAge = 0;
  splashRing.position.set(x, waterSurfaceAt(x, z) + 0.08, z);
  splashRing.scale.setScalar(0.65);
  splashRing.visible = true;
}

function updateSplash(dt: number) {
  if (splashAge >= 0.65) return;
  splashAge += dt;
  splashRing.scale.setScalar(0.65 + splashAge * 4.2);
  splashMaterial.opacity = clamp(1 - splashAge / 0.65, 0, 0.8);
  if (splashAge >= 0.65) splashRing.visible = false;
}

const initialCharacterModel: CharacterModelId = isCharacterModelId(settings.current.characterModel)
  ? settings.current.characterModel
  : 'quaternius-adventurer';
if (settings.current.characterModel !== initialCharacterModel) {
  settings.update({ characterModel: initialCharacterModel });
}
const player = new PlayerCharacter(LOW_POWER_MODE, initialCharacterModel);
actors.add(player.root);

type ImpactEffect = { object: THREE.Group; age: number; lifetime: number };
type BurnEffect = { object: THREE.Group; root: THREE.Group; age: number; lifetime: number };
const fireProjectiles: MagicProjectileEffect[] = [];
const impactEffects: ImpactEffect[] = [];
const burnEffects: BurnEffect[] = [];
const combatTargetMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.34, 0.46, 20),
  new THREE.MeshBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
);
combatTargetMarker.name = 'combat-target-marker';
combatTargetMarker.rotation.x = -Math.PI / 2;
combatTargetMarker.visible = false;
scene.add(combatTargetMarker);

function setEffectOpacity(root: THREE.Object3D, opacity: number) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = opacity;
    }
  });
}

function spawnMagicImpact(element: MagicElement, position: THREE.Vector3, radius = 0.42) {
  const object = createMagicBurst(element, radius);
  object.position.copy(position);
  impactEffects.push({ object, age: 0, lifetime: element === 'fire' ? 0.42 : 0.28 });
  scene.add(object);
}

function spawnFireImpact(position: THREE.Vector3) {
  spawnMagicImpact('fire', position);
}

function spawnBurnEffect(root: THREE.Group) {
  const object = createMagicBurst('fire', 0.32);
  burnEffects.push({ object, root, age: 0, lifetime: 3.0 });
  scene.add(object);
}

function spawnFireProjectile(directionOverride?: THREE.Vector3) {
  const origin = player.root.position.clone();
  const direction = directionOverride?.clone() ?? new THREE.Vector3(Math.sin(player.root.rotation.y), 0, Math.cos(player.root.rotation.y));
  direction.y = 0;
  direction.normalize();
  origin.y += player.swimming ? 0.35 : 1.15;
  origin.addScaledVector(direction, 0.65);
  const projectile = new MagicProjectileEffect('fire', origin, direction, 9, 1.15);
  fireProjectiles.push(projectile);
  scene.add(projectile.object);
}

function updateMagicEffects(dt: number) {
  for (let i = fireProjectiles.length - 1; i >= 0; i--) {
    const projectile = fireProjectiles[i];
    const previous = projectile.object.position.clone();
    const alive = projectile.update(dt);
    const p = projectile.object.position;
    const animalHit = fauna?.damageAt(p.x, p.y, p.z, 0.75, 18, 'fire') ?? null;
    if (animalHit) {
      spawnMagicImpact('fire', p, 0.48);
      if (!animalHit.killed) spawnBurnEffect(animalHit.root);
      scene.remove(projectile.object);
      projectile.dispose();
      fireProjectiles.splice(i, 1);
      continue;
    }
    const terrainImpact = p.y <= terrainHeightAt(p.x, p.z) + 0.12;
    if (!alive || terrainImpact) {
      if (terrainImpact) spawnFireImpact(p);
      scene.remove(projectile.object);
      projectile.dispose();
      fireProjectiles.splice(i, 1);
    } else if (waterAt(p.x, p.z) && p.y <= waterSurfaceAt(p.x, p.z) + 0.1) {
      spawnFireImpact(previous);
      scene.remove(projectile.object);
      projectile.dispose();
      fireProjectiles.splice(i, 1);
    }
  }

  for (let i = impactEffects.length - 1; i >= 0; i--) {
    const effect = impactEffects[i];
    effect.age += dt;
    const progress = clamp(effect.age / effect.lifetime, 0, 1);
    effect.object.scale.setScalar(0.55 + progress * 1.65);
    setEffectOpacity(effect.object, 0.9 * (1 - progress));
    if (progress >= 1) {
      scene.remove(effect.object);
      disposeMagicEffect(effect.object);
      impactEffects.splice(i, 1);
    }
  }

  for (let i = burnEffects.length - 1; i >= 0; i--) {
    const effect = burnEffects[i];
    effect.age += dt;
    effect.object.position.copy(effect.root.position);
    effect.object.position.y += 0.75;
    const progress = clamp(effect.age / effect.lifetime, 0, 1);
    effect.object.scale.setScalar(0.65 + Math.sin(effect.age * 18) * 0.08 + progress * 0.55);
    setEffectOpacity(effect.object, 0.78 * (1 - progress));
    if (progress >= 1 || !effect.root.parent) {
      scene.remove(effect.object);
      disposeMagicEffect(effect.object);
      burnEffects.splice(i, 1);
    }
  }
}

function performMelee(kind: 'attack' | 'punch' | 'kick') {
  const target = getAimTarget(true, true);
  if (!player.playAction(kind)) return;
  const damage = kind === 'attack' ? 32 : kind === 'kick' ? 26 : 22;
  if (target?.userData.animal) {
    const hit = fauna?.damageAt(target.position.x, target.position.y + 0.9, target.position.z, kind === 'attack' ? 3.2 : 2.65, damage, 'melee');
    if (hit) {
      spawnMagicImpact('lightning', target.position.clone().setY(target.position.y + 0.45), 0.28);
      say(`${kind === 'attack' ? 'Sword slash' : kind === 'kick' ? 'Round kick' : 'Fast punch'} · ${hit.hp}/${hit.hp + damage} HP`);
      return;
    }
  }
  say(kind === 'attack' ? 'Sword slash' : kind === 'kick' ? 'Round kick' : 'Fast punch');
}

function triggerSwordAttack() {
  performMelee('attack');
}

function triggerPunch() {
  performMelee('punch');
}

function triggerKick() {
  performMelee('kick');
}

function triggerFireCast() {
  if (!player.playAction('cast')) return;
  const target = getAimTarget(true, true);
  const origin = player.root.position.clone().setY(player.root.position.y + (player.swimming ? 0.35 : 1.15));
  const direction = target
    ? target.position.clone().add(new THREE.Vector3(0, 0.75, 0)).sub(origin).normalize()
    : new THREE.Vector3(Math.sin(player.root.rotation.y), 0, Math.cos(player.root.rotation.y));
  spawnFireProjectile(direction);
  say(target?.userData.animal ? 'Fire bolt · burning target' : 'Fire bolt');
}

let fauna: WildlifeSystem | null = null;

function disposeWorldObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!isSharedAnimalAsset(o.geometry) && !environmentAssets.isSharedGeometry(o.geometry) && !geometries.has(o.geometry)) {
      geometries.add(o.geometry);
      o.geometry.dispose();
    }
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const material of list) {
      if (
        material !== waterMaterial &&
        material !== terrainMaterial &&
        material !== waterfallMaterial &&
        material !== springMaterial &&
        !isSharedAnimalAsset(material) &&
        !environmentAssets.isSharedMaterial(material) &&
        !materials.has(material)
      ) {
        materials.add(material);
        material.dispose();
      }
    }
  });
}

// --- CHUNKS MANAGEMENT ---
class Chunks {
  loaded = new Map<string, THREE.Group>();
  changes: Record<string, string[]> = {};
  aimTargets = new Set<THREE.Object3D>();
  cameraBlockers = new Set<THREE.Object3D>();
  homeLevel: HomeLevel = 1;

  private indexChunk(g: THREE.Group) {
    const targets: THREE.Object3D[] = [], blockers: THREE.Object3D[] = [];
    g.traverse(o => {
      if (o.userData.resource || o.userData.interactable) {
        targets.push(o);
        this.aimTargets.add(o);
      }
      if (o.userData.resource || o.name === 'home' || o.name === 'wooden-bridge') {
        blockers.push(o);
        this.cameraBlockers.add(o);
      }
    });
    g.userData.aimTargets = targets;
    g.userData.cameraBlockers = blockers;
  }

  releaseChunk(g: THREE.Group) {
    for (const o of (g.userData.aimTargets as THREE.Object3D[]) || []) this.aimTargets.delete(o);
    for (const o of (g.userData.cameraBlockers as THREE.Object3D[]) || []) this.cameraBlockers.delete(o);
    disposeWorldObjects(g);
  }

  unregisterObject(o: THREE.Object3D) {
    this.aimTargets.delete(o);
    this.cameraBlockers.delete(o);
    if (aimCache === o) {
      aimCache = null;
      aimTimer = 0;
    }
    disposeWorldObjects(o);
  }

  key(x: number, z: number) {
    return `${x},${z}`;
  }
  coord(v: number) {
    return Math.floor(v / SIZE);
  }

  rebuildHome() {
    const homeChunk = this.loaded.get('0,0');
    if (!homeChunk) return;
    const existing = homeChunk.getObjectByName('home');
    if (existing) {
      this.unregisterObject(existing);
      homeChunk.remove(existing);
    }
    const isDoorOpen = (this.changes['0,0'] || []).includes('door-open');
    const newHome = buildHome(this.homeLevel, isDoorOpen);
    homeChunk.add(newHome);
    this.indexChunk(homeChunk);
  }

  build(cx: number, cz: number, lod = 0) {
    const key = this.key(cx, cz), g = new THREE.Group();
    g.name = `chunk:${key}`;
    g.userData.lod = lod;
    // Chunks partition the physical voxel volume too. The actual base material
    // is deterministic, while edits remain sparse inside VoxelChunk.
    g.userData.voxelChunk = voxelWorld.chunk(cx, cz);

    const lodSetting = settings.current.lodDetail || 'ultra';
    // Match the visible terrain tessellation to the water mesh at every LOD.
    // Misaligned grids let the water sample finer terrain cuts than the ground
    // mesh can display, creating apparent raised riverbank ledges.
    const segs =
      lod === 0
        ? (LOW_POWER_MODE ? 24 : lodSetting === 'ultra' ? 64 : lodSetting === 'balanced' ? 40 : 24)
        : lod === 1
        ? 20
        : 8;
    const terrain = new THREE.PlaneGeometry(SIZE, SIZE, segs, segs);
    terrain.rotateX(-Math.PI / 2);
    const pos = terrain.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const waterMasks = new Float32Array(pos.count);
    const terrainWaterDepths = new Float32Array(pos.count);
    const chunkBiome = biomeAt(cx * SIZE + SIZE / 2, cz * SIZE + SIZE / 2);

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i) + cx * SIZE + SIZE / 2;
      const lz = pos.getZ(i) + cz * SIZE + SIZE / 2;
      const h = terrainHeightAt(lx, lz);
      pos.setY(i, h);
      const wetDepth = waterDepthAt(lx, lz);
      waterMasks[i] = clamp(wetDepth / 0.42, 0, 1);
      terrainWaterDepths[i] = wetDepth;
      const c = terrainColorAt(h, lx, lz, chunkBiome);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrain.setAttribute('aWaterMask', new THREE.BufferAttribute(waterMasks, 1));
    terrain.setAttribute('aWaterDepth', new THREE.BufferAttribute(terrainWaterDepths, 1));
    terrain.computeVertexNormals();

    const ground = new THREE.Mesh(terrain, terrainMaterial);
    ground.position.set(cx * SIZE + SIZE / 2, 0, cz * SIZE + SIZE / 2);
    ground.receiveShadow = lod === 0;
    ground.name = 'terrain';
    g.add(ground);

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3d4348, roughness: 1 });

    // Roads
    for (let k = -WORLD_RADIUS; k <= WORLD_RADIUS; k++) {
      const center = k * ROAD_SPACING;
      if (center >= cz * SIZE - ROAD_WIDTH / 2 && center <= (cz + 1) * SIZE + ROAD_WIDTH / 2) {
        const rx = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, ROAD_WIDTH, 16, 2), roadMat);
        rx.rotation.x = -Math.PI / 2;
        const xp = rx.geometry.getAttribute('position');
        for (let i = 0; i < xp.count; i++) {
          const lx = xp.getX(i) + cx * SIZE + SIZE / 2, lz = xp.getZ(i) + center;
          xp.setY(i, terrainHeightAt(lx, lz) + 0.055);
        }
        rx.geometry.computeVertexNormals();
        rx.position.set(cx * SIZE + SIZE / 2, 0, center);
        rx.name = 'road-x';
        g.add(rx);
      }
      if (center >= cx * SIZE - ROAD_WIDTH / 2 && center <= (cx + 1) * SIZE + ROAD_WIDTH / 2) {
        const rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, SIZE, 2, 16), roadMat);
        rz.rotation.x = -Math.PI / 2;
        const zp = rz.geometry.getAttribute('position');
        for (let i = 0; i < zp.count; i++) {
          const lx = zp.getX(i) + center, lz = zp.getZ(i) + cz * SIZE + SIZE / 2;
          zp.setY(i, terrainHeightAt(lx, lz) + 0.055);
        }
        rz.geometry.computeVertexNormals();
        rz.position.set(center, 0, cz * SIZE + SIZE / 2);
        rz.name = 'road-z';
        g.add(rz);
      }
    }

    // Bridges where road crosses river in this chunk
    const chunkMidX = cx * SIZE + SIZE / 2, chunkMidZ = cz * SIZE + SIZE / 2;
    if (isBridgeAt(chunkMidX, chunkMidZ)) {
      const bridge = buildBridge(chunkMidX, chunkMidZ);
      g.add(bridge);
    }

    // Physical Seamless Water Mesh
    const waterGroup = new THREE.Group();
    waterGroup.name = 'water';
    waterGroup.position.set(cx * SIZE, 0, cz * SIZE);

    // Terrain and water now share the same vertices at each LOD.
    const waterGrid = segs;
    const step = SIZE / waterGrid;
    const waterPositions: number[] = [], waterColors: number[] = [], waterIndices: number[] = [];
    // Per-vertex real water depth and surface flow (m/s), consumed by the water shader.
    const waterDepthAttr: number[] = [], waterFlowAttr: number[] = [];

    const deepNavy = new THREE.Color(0x0e2b47);
    const emeraldMid = new THREE.Color(0x23757a);
    const turquoiseShallow = new THREE.Color(0x56b8ad);
    const shorelineFoam = new THREE.Color(0xf4f9fa);

    // Build grid vertices for wet cells and a one-cell shoreline skirt.
    // Triangle inclusion below still uses the authoritative wet mask, so a
    // dry island cannot become covered by a bridge of water triangles.
    const vertIndex = new Int32Array((waterGrid + 1) * (waterGrid + 1)).fill(-1);
    const wetVertex = new Uint8Array((waterGrid + 1) * (waterGrid + 1));
    let nextIdx = 0;

    for (let iz = 0; iz <= waterGrid; iz++) {
      for (let ix = 0; ix <= waterGrid; ix++) {
        const wx = cx * SIZE + ix * step;
        const wz = cz * SIZE + iz * step;
        if (nearHome(wx, wz)) continue;

        const depth = waterDepthAt(wx, wz);
        // A water-surface vertex must be genuinely wet. Do not create a dry
        // shoreline vertex and then bridge it to wet vertices: that produces a
        // thin sheet of "water" over grass/high ground. The shoreline is now
        // represented only by the physical water edge/side wall below.
        if (depth > 0.005) {
          const vertexSlot = iz * (waterGrid + 1) + ix;
          vertIndex[vertexSlot] = nextIdx++;
          wetVertex[vertexSlot] = 1;
          const surfaceY = waterSurfaceAt(wx, wz);
          waterPositions.push(ix * step, surfaceY, iz * step);

          waterDepthAttr.push(depth);
          const flow = waterFlowAt(wx, wz);
          waterFlowAttr.push(flow.flowVector.x * flow.flowSpeed, flow.flowVector.y * flow.flowSpeed);

          // Base tint by depth. White shoreline foam is added in the shader
          // (animated, depth-driven), so shallows here stay a clear turquoise.
          const c = new THREE.Color();
          if (depth < 0.45) {
            c.copy(turquoiseShallow).lerp(shorelineFoam, (1 - depth / 0.45) * 0.3);
          } else if (depth < 1.1) {
            c.copy(turquoiseShallow).lerp(emeraldMid, (depth - 0.45) / 0.65);
          } else {
            c.copy(emeraldMid).lerp(deepNavy, clamp((depth - 1.1) / 1.2, 0, 1));
          }
          waterColors.push(c.r, c.g, c.b);
        }
      }
    }

    // Connect quads
    for (let iz = 0; iz < waterGrid; iz++) {
      for (let ix = 0; ix < waterGrid; ix++) {
        const i00 = vertIndex[iz * (waterGrid + 1) + ix];
        const i10 = vertIndex[iz * (waterGrid + 1) + ix + 1];
        const i01 = vertIndex[(iz + 1) * (waterGrid + 1) + ix];
        const i11 = vertIndex[(iz + 1) * (waterGrid + 1) + ix + 1];

        const wxMid = cx * SIZE + (ix + 0.5) * step;
        const wzMid = cz * SIZE + (iz + 0.5) * step;
        if (nearHome(wxMid, wzMid)) continue;

        // Never span a triangle across dry land. This is the renderer-side
        // enforcement of the hydrology rule: if a location has insufficient
        // water to occupy the cell, it stays grass/terrain and the water ends.
        const hasWaterInCell =
          waterDepthAt(wxMid, wzMid) > 0.005 &&
          i00 >= 0 && i10 >= 0 && i11 >= 0 && i01 >= 0;

        if (hasWaterInCell) {
          waterIndices.push(i00, i01, i11);
          waterIndices.push(i00, i11, i10);
        }
      }
    }

    if (waterIndices.length) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(waterColors, 3));
      geom.setAttribute('aDepth', new THREE.Float32BufferAttribute(waterDepthAttr, 1));
      geom.setAttribute('aFlow', new THREE.Float32BufferAttribute(waterFlowAttr, 2));
      geom.setIndex(waterIndices);
      geom.computeVertexNormals();
      const waterMesh = new THREE.Mesh(geom, waterMaterial);
      waterMesh.name = 'water-surface';
      waterGroup.add(waterMesh);

      // Do not extrude a vertical wall around every wet/dry grid edge.
      // The carved terrain forms the natural bank; the old cell-by-cell walls
      // looked like raised platforms and could snag the player at the shore.

      g.add(waterGroup);
      g.userData.water = true;
    }

    // Natural waterfalls and alpine spring pools are driven by the same
    // drainage field as terrain and water.
    if (lod <= 1) {
      const sampleStep = lod === 0 ? 4 : 8;
      let waterfallCount = 0;
      for (let fz = sampleStep * 0.5; fz < SIZE && waterfallCount < 2; fz += sampleStep) {
        for (let fx = sampleStep * 0.5; fx < SIZE && waterfallCount < 2; fx += sampleStep) {
          const wx = cx * SIZE + fx;
          const wz = cz * SIZE + fz;
          if (nearHome(wx, wz) || nearVillage(wx, wz) || !waterAt(wx, wz)) continue;

          const flow = waterFlowAt(wx, wz);
          if (flow.flowDrop < 1.25 || flow.flowSpeed < 1.05) continue;

          const ux = flow.flowVector.x;
          const uz = flow.flowVector.y;
          const downX = wx + ux * SIZE * 0.35;
          const downZ = wz + uz * SIZE * 0.35;
          const topY = waterSurfaceAt(wx, wz);
          const bottomY = waterSurfaceAt(downX, downZ);
          const fallHeight = topY - bottomY;
          if (fallHeight < 0.85) continue;

          const visibleHeight = Math.min(8.0, fallHeight);
          const width = clamp(0.8 + flow.flowSpeed * 0.62 + flow.flowAccumulation / 4200, 0.9, 4.5);
          const waterfall = new THREE.Mesh(
            new THREE.PlaneGeometry(width, visibleHeight, 1, 6),
            waterfallMaterial
          );
          waterfall.name = 'waterfall';
          waterfall.position.set(
            wx + ux * 0.9,
            bottomY + visibleHeight * 0.5,
            wz + uz * 0.9
          );
          waterfall.rotation.y = Math.atan2(ux, uz);
          g.add(waterfall);
          waterfallCount++;
        }
      }

      if (lod === 0) {
        const springStep = 8;
        let springCount = 0;
        for (let fz = springStep * 0.5; fz < SIZE && springCount < 1; fz += springStep) {
          for (let fx = springStep * 0.5; fx < SIZE && springCount < 1; fx += springStep) {
            const wx = cx * SIZE + fx;
            const wz = cz * SIZE + fz;
            const flow = waterFlowAt(wx, wz);
            if (flow.waterType !== 'spring' || !waterAt(wx, wz)) continue;

            const pool = new THREE.Mesh(
              new THREE.CylinderGeometry(0.34, 0.58, 0.08, 18),
              springMaterial
            );
            pool.name = 'spring-pool';
            pool.position.set(wx, waterSurfaceAt(wx, wz) + 0.035, wz);
            g.add(pool);
            springCount++;
          }
        }
      }
    }

    // Trees and Rocks (Rule: Tree will never spawn into a rock)
    const removed = this.changes[key] || [];
    const placedProps: { x: number; z: number }[] = [];

    if (lod < 2) {
      const maxTrees = lod === 0 ? 10 : 5;
      for (let i = 0; i < maxTrees; i++) {
        if (hash(cx * 17 + i, cz * 23 - i) <= 0.52) continue;
        const tx = cx * SIZE + 2 + hash(cx + i, cz - i) * (SIZE - 4);
        const tz = cz * SIZE + 2 + hash(cx - i, cz + i) * (SIZE - 4);
        if (roadAt(tx, tz) || waterAt(tx, tz) || nearHome(tx, tz) || nearVillage(tx, tz)) continue;

        // Collision rule: Tree will not spawn into any existing prop/rock
        if (placedProps.some(p => Math.hypot(p.x - tx, p.z - tz) < 3.2)) continue;
        placedProps.push({ x: tx, z: tz });

        const kind = pickTreeKind(cx, cz, i, tx, tz);
        const def = RESOURCE_DEFS[kind];
        const name = `tree-${i}`;
        const entry = removed.find(e => e === name || e.startsWith(name + '@'));
        if (entry) {
          const at = entry.includes('@') ? Number(entry.split('@')[1]) : 0;
          const elapsed = (Date.now() - at) / 1000;
          if (elapsed < def.regrowSeconds) {
            const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x5c4028 }));
            stump.name = `stump-${i}`;
            stump.position.set(tx, terrainHeightAt(tx, tz) + 0.15, tz);
            g.add(stump);
            continue;
          }
          const idx = removed.indexOf(entry);
          if (idx >= 0) removed.splice(idx, 1);
        }

        const tree = buildTree(kind, lod);
        tree.name = name;
        tree.userData.resource = { kind, hits: def.hitsToFell, maxHits: def.hitsToFell };
        tree.userData.colliderRadius = def.colliderRadius;
        tree.position.set(tx, terrainHeightAt(tx, tz), tz);
        g.add(tree);
      }

      const maxRocks = lod === 0 ? 5 : 2;
      for (let i = 0; i < maxRocks; i++) {
        if (hash(cx * 41 + i * 7, cz * 47 - i * 5) <= 0.6) continue;
        const tx = cx * SIZE + 2 + hash(cx - i * 3, cz + i * 5) * (SIZE - 4);
        const tz = cz * SIZE + 2 + hash(cx + i * 5, cz - i * 3) * (SIZE - 4);
        if (roadAt(tx, tz) || waterAt(tx, tz) || nearHome(tx, tz) || nearVillage(tx, tz)) continue;

        // Collision rule: Rock will not spawn into any tree
        if (placedProps.some(p => Math.hypot(p.x - tx, p.z - tz) < 3.2)) continue;
        placedProps.push({ x: tx, z: tz });

        const mtn = mountainMaskAt(tx, tz);
        if (mtn < 0.15 && hash(cx * 3 + i, cz * 5 - i) > 0.25) continue;

        const kind: ResourceKind = mtn > 0.55 && hash(cx * 13 + i, cz * 17 - i) < 0.4 ? 'boulder' : 'rock';
        const def = RESOURCE_DEFS[kind];
        const name = `rock-${i}`;
        const entry = removed.find(e => e === name || e.startsWith(name + '@'));
        if (entry) {
          const rubble = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0x5a5d60 }));
          rubble.name = `rubble-${i}`;
          rubble.position.set(tx, terrainHeightAt(tx, tz) + 0.07, tz);
          g.add(rubble);
          continue;
        }

        const rock = buildRock(kind, lod);
        rock.name = name;
        rock.userData.resource = { kind, hits: def.hitsToFell, maxHits: def.hitsToFell };
        rock.userData.colliderRadius = def.colliderRadius;
        rock.position.set(tx, terrainHeightAt(tx, tz), tz);
        g.add(rock);
      }
    }

    fauna?.spawnChunk(cx, cz, lod, g);

    // Spawn Home in (0,0) chunk
    if (cx === 0 && cz === 0) {
      const isDoorOpen = (this.changes['0,0'] || []).includes('door-open');
      const home = buildHome(this.homeLevel, isDoorOpen);
      g.add(home);
    }

    // Spawn Riverwood Village in (Math.floor(VILLAGE_X/SIZE), Math.floor(VILLAGE_Z/SIZE)) chunk
    if (cx === Math.floor(VILLAGE_X / SIZE) && cz === Math.floor(VILLAGE_Z / SIZE)) {
      buildVillage(g);
    }

    this.indexChunk(g);
    world.add(g);
    this.loaded.set(key, g);
  }

  stream(px: number, pz: number) {
    const cx = this.coord(px), cz = this.coord(pz);
    const radius = settings.current.chunkRadius;

    for (const [k, g] of this.loaded) {
      const [a, b] = k.split(',').map(Number);
      if (Math.abs(a - cx) > radius || Math.abs(b - cz) > radius) {
        fauna?.removeChunk(k);
        this.releaseChunk(g);
        world.remove(g);
        this.loaded.delete(k);
      }
    }

    const minX = Math.max(-WORLD_RADIUS, cx - radius), maxX = Math.min(WORLD_RADIUS, cx + radius);
    const minZ = Math.max(-WORLD_RADIUS, cz - radius), maxZ = Math.min(WORLD_RADIUS, cz + radius);

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const dist = Math.max(Math.abs(x - cx), Math.abs(z - cz));
        const lod = dist <= 2 ? 0 : dist <= 5 ? 1 : 2;
        const key = this.key(x, z), existing = this.loaded.get(key);
        if (!existing) {
          this.build(x, z, lod);
        } else if (existing.userData.lod > lod) {
          fauna?.removeChunk(key);
          this.releaseChunk(existing);
          world.remove(existing);
          this.loaded.delete(key);
          this.build(x, z, lod);
        }
      }
    }
  }

  async surveyAll(active: boolean, onProgress?: (done: number, total: number) => void) {
    if (active) {
      // The survey is deliberately expensive: materialize the complete finite
      // world at gameplay-quality LOD0, but yield to the browser between batches
      // so the loading overlay can paint instead of looking like a frozen/crashed game.
      const total = (WORLD_RADIUS * 2 + 1) ** 2;
      let done = 0;
      const batchSize = LOW_POWER_MODE ? 4 : 8;
      onProgress?.(0, total);

      for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
        for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z++) {
          const key = this.key(x, z);
          if (!this.loaded.has(key)) this.build(x, z, 0);
          else if (this.loaded.get(key)?.userData.lod !== 0) {
            const old = this.loaded.get(key)!;
            fauna?.removeChunk(key);
            this.releaseChunk(old);
            world.remove(old);
            this.loaded.delete(key);
            this.build(x, z, 0);
          }

          done++;
          if (done % batchSize === 0) {
            onProgress?.(done, total);
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          }
        }
      }

      // The expensive full-world volume is survey-only. Normal gameplay keeps
      // the compact surface representation, while WORLD Survey gets a real
      // vertical geological mass when the camera is lifted to the side.
      if (!voxelSurveyGroup.getObjectByName('voxel-world-volume')) {
        const volume = buildVoxelWorldVolumeMesh();
        if (volume) voxelSurveyGroup.add(volume);
      }
      if (!voxelSurveyGroup.getObjectByName('voxel-water-volume')) {
        const waterVolume = buildVoxelWorldWaterVolumeMesh();
        if (waterVolume) voxelSurveyGroup.add(waterVolume);
      }

      // The closed voxel meshes are now the authoritative visual surface for
      // Survey. Roads/buildings/vegetation/actors remain visible on top.
      setSurveySurfaceMeshesVisible(false);
      voxelSurveyGroup.visible = true;

      onProgress?.(total, total);
      return;
    }
    voxelSurveyGroup.visible = false;
    for (const child of [...voxelSurveyGroup.children]) {
      child.removeFromParent();
      const mesh = child as THREE.Mesh;
      if (mesh.geometry instanceof THREE.BufferGeometry) mesh.geometry.dispose();
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materials) mat.dispose();
      }
    }
    setSurveySurfaceMeshesVisible(true);
    this.stream(player.root.position.x, player.root.position.z);
  }

  rebuildAll() {
    for (const [k, g] of this.loaded) {
      this.releaseChunk(g);
      world.remove(g);
    }
    this.loaded.clear();
    this.stream(player.root.position.x, player.root.position.z);
  }
}

const chunks = new Chunks();

let save: Save = {
  version: 2,
  player: { x: HOME_X, y: HOME_BASE_HEIGHT + 0.1, z: HOME_Z + 7.5, ry: Math.PI, mode: 'tpp' },
  camera: { yaw: 0, pitch: -0.15, distance: 6 },
  changes: {},
  inventory: {},
  homeLevel: 1,
};

try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = JSON.parse(raw);
} catch {}

chunks.changes = save.changes || {};
chunks.homeLevel = save.homeLevel || 1;
voxelWorld.applyEdits(save.voxelEdits || []);
player.root.position.set(save.player.x, save.player.y, save.player.z);

// Safety validation: If saved position was inside ocean/water or invalid, spawn on dry homestead porch!
if (
  waterAt(player.root.position.x, player.root.position.z) ||
  !Number.isFinite(player.root.position.y) ||
  player.root.position.y < terrainHeightAt(player.root.position.x, player.root.position.z)
) {
  player.root.position.set(HOME_X, HOME_BASE_HEIGHT + 0.1, HOME_Z + 7.5);
  player.root.rotation.y = Math.PI;
} else {
  player.root.rotation.y = save.player.ry;
}

let mode: Mode = save.player.mode || 'tpp';
let camYaw = save.camera.yaw, camPitch = save.camera.pitch, camDistance = save.camera.distance;
let targetYaw = camYaw, targetPitch = camPitch, targetDistance = camDistance;
let inventory: Record<string, number> = save.inventory || {};
let worldTime = save.worldTime ?? 9;

function saveNow() {
  save = {
    version: 2,
    player: { x: player.root.position.x, y: player.root.position.y, z: player.root.position.z, ry: player.root.rotation.y, mode },
    camera: { yaw: camYaw, pitch: camPitch, distance: camDistance },
    changes: chunks.changes,
    inventory,
    wildlifeTrust: fauna?.trust ?? save.wildlifeTrust ?? {},
    worldTime,
    homeLevel: chunks.homeLevel,
    voxelEdits: voxelWorld.edits(),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

// Untouched terrain keeps its continuous heightfield behavior. A voxel-edited
// column becomes grounded by its actual top solid cell until the next remesh
// milestone replaces the visible gameplay surface too.
function physicalGroundHeightAt(x: number, z: number): number {
  return voxelWorld.hasGroundOverride(x, z)
    ? voxelWorld.groundHeight(x, z)
    : terrainHeightAt(x, z);
}

// --- INPUTS & CONTROLS ---
const keys = new Set<string>();
let survival: ZombieSurvivalSystem;
const keyboardKeys = new Set<string>();
const pointerKeys = new Map<string, Set<number>>();
let hudEditMode = false;
let adsToggleOn = false;

function syncKeyState(key: string) {
  if (keyboardKeys.has(key) || (pointerKeys.get(key)?.size ?? 0) > 0) keys.add(key);
  else keys.delete(key);
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('button, input, select, textarea, [contenteditable="true"]');
}

addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (isInteractiveTarget(e.target)) return;
  if (survival?.enabled) survival.activateAudio();
  keyboardKeys.add(key);
  syncKeyState(key);
  if (key === ' ' || key.startsWith('arrow')) e.preventDefault();
  if (key === 'f') mode = 'fpp';
  if (key === 'c' && !survival?.enabled) mode = 'tpp';
  if (!e.repeat && key === 'e') interact();
  if (!e.repeat && key === 'q' && !survival?.enabled) triggerSwordAttack();
  if (!e.repeat && key === 'z') setSurvivalEnabled(!survival.enabled);
  if (!e.repeat && key === 'x' && !survival?.enabled) triggerKick();
  if (!e.repeat && key === 'v' && !survival?.enabled) player.playAction('roll') && say('Dodge roll');
  if (!e.repeat && key === 'r') {
    if (survival?.enabled) survival.reload();
    else triggerFireCast();
  }
  if (!e.repeat && key === '1' && survival?.enabled) survival.switchWeapon('pistol');
  if (!e.repeat && key === '2' && survival?.enabled) survival.switchWeapon('shotgun');
  if (!e.repeat && key === '3' && survival?.enabled) survival.switchWeapon('rifle');
  if (!e.repeat && key === 'b' && !survival?.enabled) toggleEmoteBar();
  if (!e.repeat && key === 'p') togglePhotoMode();
});
addEventListener('keyup', e => {
  const key = e.key.toLowerCase();
  keyboardKeys.delete(key);
  syncKeyState(key);
});

// Look drag with Independent X / Y Sensitivities
let pointer: number | null = null, lastX = 0, lastY = 0;
const surveyPointers = new Map<number, { x: number; y: number }>();
let surveyPinchDistance = 0;
let surveyLastMidX = 0;
let surveyLastMidY = 0;
let surveyMoved = false;
const gameDom = renderer.domElement;

let lookGestureDistance = 0;
let lastLookMoveAt = 0;

function beginLookGesture(clientX: number, clientY: number) {
  lastX = clientX;
  lastY = clientY;
  lookGestureDistance = 0;
  lastLookMoveAt = performance.now();
}

function onLookMove(clientX: number, clientY: number) {
  const dx = clientX - lastX;
  const dy = clientY - lastY;
  if (survey.isActive) {
    survey.pan(dx, dy);
    lastX = clientX;
    lastY = clientY;
    return;
  }
  lastX = clientX;
  lastY = clientY;

  const now = performance.now();
  const elapsed = Math.max(0.008, (now - (lastLookMoveAt || now - 16)) / 1000);
  lastLookMoveAt = now;
  lookGestureDistance += Math.hypot(dx, dy);

  const accelerationMode = settings.current.cameraAcceleration;
  const accelerationStrength = Math.max(0, Math.min(2, settings.current.cameraAccelerationStrength));
  let acceleration = 1;
  if (accelerationMode === 'distance') {
    const distanceFactor = clamp(lookGestureDistance / Math.max(100, window.innerWidth * 0.38), 0, 1);
    acceleration += accelerationStrength * distanceFactor;
  } else if (accelerationMode === 'speed') {
    const speedPxPerSecond = Math.hypot(dx, dy) / elapsed;
    acceleration += accelerationStrength * clamp(speedPxPerSecond / 1100, 0, 1);
  }

  const sensX = settings.current.sensitivityX;
  const sensY = settings.current.sensitivityY;
  const invertY = settings.current.invertY ? -1 : 1;
  // Sensitivity is expressed in degrees for a swipe spanning the full viewport.
  // Separate pointer IDs let the left thumb move while another finger looks,
  // aims or shoots on the right without cancelling either gesture.
  targetYaw += (dx / Math.max(1, window.innerWidth)) * (sensX * Math.PI / 180) * acceleration;
  targetPitch = clamp(
    targetPitch - (dy / Math.max(1, window.innerHeight)) * (sensY * Math.PI / 180) * invertY * acceleration,
    -1.2,
    0.95
  );
}

gameDom.addEventListener('pointerdown', e => {
  if (survey.isActive) {
    surveyPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    surveyMoved = false;
    if (surveyPointers.size === 2) {
      const [a, b] = [...surveyPointers.values()];
      surveyPinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      surveyLastMidX = (a.x + b.x) * 0.5;
      surveyLastMidY = (a.y + b.y) * 0.5;
    }
    gameDom.setPointerCapture(e.pointerId);
    return;
  }
  pointer = e.pointerId;
  beginLookGesture(e.clientX, e.clientY);
  gameDom.setPointerCapture(e.pointerId);
});
gameDom.addEventListener('pointermove', e => {
  if (survey.isActive) {
    const existing = surveyPointers.get(e.pointerId);
    if (!existing) return;
    const dx = e.clientX - existing.x;
    const dy = e.clientY - existing.y;
    existing.x = e.clientX;
    existing.y = e.clientY;
    if (surveyPointers.size >= 2) {
      const [a, b] = [...surveyPointers.values()];
      const nextDistance = Math.hypot(a.x - b.x, a.y - b.y);
      if (surveyPinchDistance > 0) {
        survey.zoom(surveyPinchDistance - nextDistance);
        surveyMoved = true;
      }
      surveyPinchDistance = nextDistance;
      const midX = (a.x + b.x) * 0.5;
      const midY = (a.y + b.y) * 0.5;
      survey.pan(midX - surveyLastMidX, midY - surveyLastMidY);
      surveyLastMidX = midX;
      surveyLastMidY = midY;
    } else {
      if (Math.hypot(dx, dy) > 4) surveyMoved = true;
      survey.orbit(dx, dy);
    }
    return;
  }
  if (pointer !== e.pointerId) return;
  onLookMove(e.clientX, e.clientY);
});
const endSurveyPointer = (e: PointerEvent) => {
  if (!survey.isActive) return;
  if (!surveyMoved && surveyPointers.size === 1) {
    survey.focusScreen(e.clientX, e.clientY, gameDom.getBoundingClientRect());
  }
  surveyPointers.delete(e.pointerId);
  if (surveyPointers.size < 2) {
    surveyPinchDistance = 0;
    surveyLastMidX = surveyLastMidY = 0;
  }
  pointer = null;
};
gameDom.addEventListener('pointerup', endSurveyPointer);
gameDom.addEventListener('pointercancel', endSurveyPointer);

gameDom.addEventListener('wheel', e => {
  e.preventDefault();
  if (survey.isActive) {
    survey.zoom(e.deltaY);
    return;
  }
  targetDistance = clamp(targetDistance + e.deltaY * 0.008, 2.2, 13);
}, { passive: false });

// Full left half: dynamic touch-following movement joystick.
// Its anchor appears exactly where the thumb lands, then follows that pointer only.
const leftMoveZone = document.querySelector('#leftMoveZone') as HTMLElement;
const stick = document.querySelector('#stick') as HTMLElement;
const knob = document.querySelector('#knob') as HTMLElement;
let joy = { x: 0, y: 0 }, joyActive = false, joyPointer: number | null = null;

const moveJoy = (e: PointerEvent) => {
  if (!joyActive || joyPointer !== e.pointerId) return;
  const r = stick.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let x = e.clientX - cx, y = e.clientY - cy;
  const l = Math.hypot(x, y);
  const m = Math.min(48, r.width * 0.43);
  if (l > m && l > 0) {
    x = (x / l) * m;
    y = (y / l) * m;
  }
  joy = l > 0 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
  knob.style.transform = `translate(${x}px,${y}px)`;
};

leftMoveZone.addEventListener('pointerdown', e => {
  if (hudEditMode || joyPointer !== null || (e.pointerType === 'mouse' && !IS_TOUCH_DEVICE)) return;
  e.preventDefault();
  e.stopPropagation();
  joyPointer = e.pointerId;
  joyActive = true;
  stick.style.left = `${e.clientX}px`;
  stick.style.top = `${e.clientY}px`;
  stick.style.bottom = 'auto';
  stick.classList.add('active');
  leftMoveZone.setPointerCapture(e.pointerId);
  moveJoy(e);
});
leftMoveZone.addEventListener('pointermove', moveJoy);
const endJoy = (e: PointerEvent) => {
  if (joyPointer !== e.pointerId) return;
  e.preventDefault();
  e.stopPropagation();
  joyPointer = null;
  joyActive = false;
  joy = { x: 0, y: 0 };
  knob.style.transform = 'translate(0,0)';
  stick.classList.remove('active');
};
leftMoveZone.addEventListener('pointerup', endJoy);
leftMoveZone.addEventListener('pointercancel', endJoy);
leftMoveZone.addEventListener('lostpointercapture', endJoy);

// Mobile Look Zone (Right screen drag)
const lookZone = document.querySelector('#lookZone') as HTMLElement;
let lookPointer: number | null = null;
lookZone.addEventListener('pointerdown', e => {
  if (lookPointer !== null) return;
  e.preventDefault();
  e.stopPropagation();
  lookPointer = e.pointerId;
  beginLookGesture(e.clientX, e.clientY);
  lookZone.setPointerCapture(e.pointerId);
});
lookZone.addEventListener('pointermove', e => {
  if (lookPointer !== e.pointerId) return;
  onLookMove(e.clientX, e.clientY);
});
const endLook = (e: PointerEvent) => {
  if (lookPointer !== e.pointerId) return;
  e.stopPropagation();
  lookPointer = null;
};
lookZone.addEventListener('pointerup', endLook);
lookZone.addEventListener('pointercancel', endLook);
lookZone.addEventListener('lostpointercapture', endLook);

function bindAction(el: HTMLElement, fn: () => void) {
  const stopPointerEvent = (e: Event) => e.stopPropagation();
  el.addEventListener('pointerdown', stopPointerEvent);
  el.addEventListener('pointerup', stopPointerEvent);
  el.addEventListener('pointercancel', stopPointerEvent);
  el.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
}

function bindHoldAction(el: HTMLElement, key: string, onPress?: () => void) {
  const heldPointers = new Set<number>();
  const down = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (heldPointers.has(e.pointerId)) return;
    heldPointers.add(e.pointerId);
    let keyPointers = pointerKeys.get(key);
    if (!keyPointers) pointerKeys.set(key, (keyPointers = new Set()));
    keyPointers.add(e.pointerId);
    syncKeyState(key);
    onPress?.();
    el.setPointerCapture(e.pointerId);
  };
  const up = (e: PointerEvent) => {
    e.stopPropagation();
    if (!heldPointers.delete(e.pointerId)) return;
    const keyPointers = pointerKeys.get(key);
    keyPointers?.delete(e.pointerId);
    if (!keyPointers?.size) pointerKeys.delete(key);
    syncKeyState(key);
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
}
// --- DRAGGABLE SURVIVAL HUD LAYOUT ---
type HudLayoutItem = { x: number; y: number; size: number; opacity: number };
const HUD_LAYOUT_KEY = 'zombie-survival-hud-v1';
const HUD_DEFAULTS: Record<string, HudLayoutItem> = {
  shoot: { x: 10, y: 23, size: 66, opacity: 0.68 },
  ads: { x: 88, y: 24, size: 48, opacity: 0.62 },
  jump: { x: 92, y: 72, size: 46, opacity: 0.56 },
  reload: { x: 80, y: 81, size: 44, opacity: 0.56 },
  use: { x: 69, y: 55, size: 46, opacity: 0.62 },
};
const HUD_PRESETS: Record<'four' | 'three' | 'thumbs', Record<string, { x: number; y: number }>> = {
  four: {
    shoot: { x: 10, y: 23 }, ads: { x: 88, y: 24 }, jump: { x: 92, y: 72 },
    reload: { x: 80, y: 81 }, use: { x: 69, y: 55 },
  },
  three: {
    shoot: { x: 10, y: 25 }, ads: { x: 87, y: 43 }, jump: { x: 91, y: 69 },
    reload: { x: 79, y: 82 }, use: { x: 69, y: 56 },
  },
  thumbs: {
    shoot: { x: 87, y: 78 }, ads: { x: 85, y: 56 }, jump: { x: 94, y: 64 },
    reload: { x: 75, y: 83 }, use: { x: 67, y: 55 },
  },
};
const hudEditorOverlay = document.querySelector('#hudEditorOverlay') as HTMLDivElement;
const hudPresetSelect = document.querySelector('#hudPresetSelect') as HTMLSelectElement;
const hudSelectedName = document.querySelector('#hudSelectedName') as HTMLSpanElement;
const hudSizeSlider = document.querySelector('#hudSizeSlider') as HTMLInputElement;
const hudSizeVal = document.querySelector('#hudSizeVal') as HTMLSpanElement;
const hudOpacitySlider = document.querySelector('#hudOpacitySlider') as HTMLInputElement;
const hudOpacityVal = document.querySelector('#hudOpacityVal') as HTMLSpanElement;
const hudTouchButtons = Array.from(document.querySelectorAll<HTMLElement>('#touch [data-hud-id]'));
let hudLayout: Record<string, HudLayoutItem> = Object.fromEntries(
  Object.entries(HUD_DEFAULTS).map(([id, value]) => [id, { ...value }])
);
let selectedHudItem: HTMLElement | null = null;
let hudDrag: { pointerId: number; el: HTMLElement; offsetX: number; offsetY: number } | null = null;

function clampHudItem(item: HudLayoutItem): HudLayoutItem {
  return {
    x: clamp(item.x, 4, 96),
    y: clamp(item.y, 6, 94),
    size: clamp(item.size, 34, 100),
    opacity: clamp(item.opacity, 0.15, 1),
  };
}
function applyHudItem(el: HTMLElement) {
  const id = el.dataset.hudId;
  if (!id || !hudLayout[id]) return;
  const item = clampHudItem(hudLayout[id]);
  hudLayout[id] = item;
  el.style.setProperty('--hud-x', `${item.x}%`);
  el.style.setProperty('--hud-y', `${item.y}%`);
  el.style.setProperty('--hud-size', `${item.size}px`);
  el.style.setProperty('--hud-opacity', String(item.opacity));
}
function saveHudLayout() {
  try { localStorage.setItem(HUD_LAYOUT_KEY, JSON.stringify(hudLayout)); } catch {}
}
function loadHudLayout() {
  try {
    const raw = localStorage.getItem(HUD_LAYOUT_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Record<string, Partial<HudLayoutItem>>;
      for (const [id, defaults] of Object.entries(HUD_DEFAULTS)) {
        const value = stored[id];
        if (!value) continue;
        hudLayout[id] = clampHudItem({
          x: Number.isFinite(value.x) ? Number(value.x) : defaults.x,
          y: Number.isFinite(value.y) ? Number(value.y) : defaults.y,
          size: Number.isFinite(value.size) ? Number(value.size) : defaults.size,
          opacity: Number.isFinite(value.opacity) ? Number(value.opacity) : defaults.opacity,
        });
      }
    }
  } catch {
    hudLayout = Object.fromEntries(Object.entries(HUD_DEFAULTS).map(([id, value]) => [id, { ...value }]));
  }
  hudTouchButtons.forEach(applyHudItem);
}
function selectHudItem(el: HTMLElement) {
  selectedHudItem?.classList.remove('hud-selected');
  selectedHudItem = el;
  el.classList.add('hud-selected');
  const id = el.dataset.hudId || 'control';
  const name = id === 'ads' ? 'ADS / AIM' : id.toUpperCase();
  hudSelectedName.textContent = name;
  const item = hudLayout[id] || HUD_DEFAULTS[id];
  hudSizeSlider.value = String(item.size);
  hudSizeVal.textContent = `${item.size} px`;
  hudOpacitySlider.value = String(Math.round(item.opacity * 100 / 5) * 5);
  hudOpacityVal.textContent = `${Math.round(item.opacity * 100)}%`;
}
function applyHudPreset(preset: 'four' | 'three' | 'thumbs') {
  for (const [id, position] of Object.entries(HUD_PRESETS[preset])) {
    const current = hudLayout[id] || HUD_DEFAULTS[id];
    hudLayout[id] = clampHudItem({ ...current, ...position });
  }
  hudTouchButtons.forEach(applyHudItem);
  hudPresetSelect.value = preset;
  saveHudLayout();
}
function setHudEditMode(active: boolean) {
  hudEditMode = active;
  document.body.classList.toggle('hud-edit-mode', active);
  hudEditorOverlay.classList.toggle('show', active);
  hudDrag = null;
  if (active) {
    openSettings(false);
    const first = hudTouchButtons.find(el => el.dataset.hudId === 'shoot') || hudTouchButtons[0];
    if (first) selectHudItem(first);
    say('Drag HUD controls to move them. Use the sliders to resize and fade them.');
  } else {
    selectedHudItem?.classList.remove('hud-selected');
    selectedHudItem = null;
    saveHudLayout();
  }
}
loadHudLayout();

document.addEventListener('pointerdown', event => {
  if (!hudEditMode) return;
  const target = event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>('#touch [data-hud-id]')
    : null;
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  selectHudItem(target);
  const rect = target.getBoundingClientRect();
  hudDrag = {
    pointerId: event.pointerId,
    el: target,
    offsetX: event.clientX - (rect.left + rect.width / 2),
    offsetY: event.clientY - (rect.top + rect.height / 2),
  };
  try { target.setPointerCapture(event.pointerId); } catch {}
}, true);
document.addEventListener('pointermove', event => {
  if (!hudEditMode || !hudDrag || event.pointerId !== hudDrag.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = touchControls.getBoundingClientRect();
  const x = clamp(((event.clientX - hudDrag.offsetX - rect.left) / Math.max(1, rect.width)) * 100, 4, 96);
  const y = clamp(((event.clientY - hudDrag.offsetY - rect.top) / Math.max(1, rect.height)) * 100, 6, 94);
  const id = hudDrag.el.dataset.hudId!;
  hudLayout[id] = clampHudItem({ ...hudLayout[id], x, y });
  applyHudItem(hudDrag.el);
  hudPresetSelect.value = 'custom';
}, true);
document.addEventListener('pointerup', event => {
  if (!hudEditMode || !hudDrag || event.pointerId !== hudDrag.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  hudDrag = null;
  saveHudLayout();
}, true);
document.addEventListener('pointercancel', event => {
  if (!hudDrag || event.pointerId !== hudDrag.pointerId) return;
  hudDrag = null;
  saveHudLayout();
}, true);
document.addEventListener('click', event => {
  if (!hudEditMode) return;
  const target = event.target instanceof HTMLElement ? event.target.closest('#touch [data-hud-id]') : null;
  if (target) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
}, true);
hudSizeSlider.addEventListener('input', () => {
  if (!selectedHudItem) return;
  const id = selectedHudItem.dataset.hudId!;
  hudLayout[id].size = Number(hudSizeSlider.value);
  hudSizeVal.textContent = `${hudLayout[id].size} px`;
  applyHudItem(selectedHudItem);
  hudPresetSelect.value = 'custom';
  saveHudLayout();
});
hudOpacitySlider.addEventListener('input', () => {
  if (!selectedHudItem) return;
  const id = selectedHudItem.dataset.hudId!;
  hudLayout[id].opacity = Number(hudOpacitySlider.value) / 100;
  hudOpacityVal.textContent = `${hudOpacitySlider.value}%`;
  applyHudItem(selectedHudItem);
  hudPresetSelect.value = 'custom';
  saveHudLayout();
});
hudPresetSelect.addEventListener('change', () => {
  if (hudPresetSelect.value === 'four' || hudPresetSelect.value === 'three' || hudPresetSelect.value === 'thumbs') {
    applyHudPreset(hudPresetSelect.value);
    if (selectedHudItem) selectHudItem(selectedHudItem);
  }
});
bindAction(document.querySelector('#hudEditorClose') as HTMLButtonElement, () => setHudEditMode(false));
bindAction(document.querySelector('#hudSaveBtn') as HTMLButtonElement, () => setHudEditMode(false));
bindAction(document.querySelector('#hudResetBtn') as HTMLButtonElement, () => {
  hudLayout = Object.fromEntries(Object.entries(HUD_DEFAULTS).map(([id, value]) => [id, { ...value }]));
  hudTouchButtons.forEach(applyHudItem);
  hudPresetSelect.value = 'four';
  saveHudLayout();
  const first = hudTouchButtons.find(el => el.dataset.hudId === 'shoot') || hudTouchButtons[0];
  if (first) selectHudItem(first);
});


// Touch buttons. Survival mode reuses the same joystick/look zones but swaps fantasy actions for FPS actions.
bindAction(document.querySelector('#modeBtn') as HTMLButtonElement, () => {
  if (survival?.enabled) {
    say('First-person view is fixed in survival mode');
    return;
  }
  mode = mode === 'tpp' ? 'fpp' : 'tpp';
});
bindAction(document.querySelector('#attackBtn') as HTMLButtonElement, triggerSwordAttack);
bindAction(document.querySelector('#punchBtn') as HTMLButtonElement, triggerPunch);
bindAction(document.querySelector('#kickBtn') as HTMLButtonElement, triggerKick);
bindAction(document.querySelector('#castBtn') as HTMLButtonElement, () => survival?.enabled ? survival.fire() : triggerFireCast());
bindHoldAction(document.querySelector('#shootBtn') as HTMLButtonElement, 'shoot', () => survival?.enabled && survival.fire());
const adsButton = document.querySelector('#aimBtn') as HTMLButtonElement;
bindAction(adsButton, () => {
  adsToggleOn = !adsToggleOn;
  document.body.classList.toggle('aim-active', adsToggleOn);
  adsButton.setAttribute('aria-pressed', String(adsToggleOn));
  adsButton.title = adsToggleOn ? 'ADS enabled · tap to return to hip-fire' : 'Toggle aim down sights';
  say(adsToggleOn ? 'AIM DOWN SIGHTS' : 'HIP-FIRE');
});
bindAction(document.querySelector('#reloadBtn') as HTMLButtonElement, () => survival?.enabled && survival.reload());
bindHoldAction(document.querySelector('#jumpBtn') as HTMLButtonElement, ' ', jump);
bindHoldAction(document.querySelector('#diveBtn') as HTMLButtonElement, 'control');
bindAction(document.querySelector('#runBtn') as HTMLButtonElement, () => (sprintToggle = !sprintToggle));
bindAction(document.querySelector('#interactBtn') as HTMLButtonElement, interact);

// Mouse fire and right-click aim on desktop; mobile uses the pointer-captured HUD buttons.
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || isInteractiveTarget(e.target) || !survival?.enabled || survey.isActive) return;
  if (e.button === 0) {
    e.preventDefault();
    survival.setFireHeld(true);
    survival.fire();
  } else if (e.button === 2) {
    e.preventDefault();
    let holders = pointerKeys.get('aim');
    if (!holders) pointerKeys.set('aim', (holders = new Set()));
    holders.add(e.pointerId);
    syncKeyState('aim');
  }
});
window.addEventListener('pointerup', e => {
  if (e.pointerType !== 'mouse') return;
  if (e.button === 0) survival?.setFireHeld(false);
  if (e.button === 2) {
    const holders = pointerKeys.get('aim');
    holders?.delete(e.pointerId);
    if (!holders?.size) pointerKeys.delete('aim');
    syncKeyState('aim');
  }
});
renderer.domElement.addEventListener('contextmenu', e => {
  if (survival?.enabled) e.preventDefault();
});

const emoteBtn = document.querySelector('#emoteBtn') as HTMLButtonElement;
const emoteBar = document.querySelector('#emoteBar') as HTMLDivElement;
function toggleEmoteBar() {
  emoteBar.classList.toggle('show');
}
bindAction(emoteBtn, toggleEmoteBar);

// Emote Options
document.querySelectorAll('.emoteOption').forEach(btn => {
  bindAction(btn as HTMLElement, () => {
    const emote = (btn as HTMLElement).dataset.emote as EmoteKind;
    if (emote) {
      player.playEmote(emote);
      say(`Emote · ${emote.toUpperCase()}`);
      emoteBar.classList.remove('show');
    }
  });
});

// UI Elements
const prompt = document.querySelector('#prompt') as HTMLDivElement;
const status = document.querySelector('#status')!;
const target = document.querySelector('#target') as HTMLDivElement;
const hud = document.querySelector('#hud') as HTMLDivElement;
const touchControls = document.querySelector('#touch') as HTMLDivElement;
const inventoryEl = document.querySelector('#inventory') as HTMLDivElement;
const compass = document.querySelector('#compass') as HTMLDivElement;
const waypointBadge = document.querySelector('#waypointBadge') as HTMLDivElement;
const survivalBtn = document.querySelector('#survivalBtn') as HTMLButtonElement | null;
const survivalHud = document.querySelector('#survivalHud') as HTMLDivElement | null;
const survivalZoneStatus = document.querySelector('#survivalZoneStatus') as HTMLSpanElement | null;
const survivalHealthText = document.querySelector('#survivalHealthText') as HTMLSpanElement | null;
const survivalHealthBar = document.querySelector('#survivalHealthBar') as HTMLSpanElement | null;
const survivalWeapon = document.querySelector('#survivalWeapon') as HTMLSpanElement | null;
const survivalAmmo = document.querySelector('#survivalAmmo') as HTMLSpanElement | null;
const survivalReserve = document.querySelector('#survivalReserve') as HTMLSpanElement | null;
const survivalKills = document.querySelector('#survivalKills') as HTMLSpanElement | null;
const survivalWave = document.querySelector('#survivalWave') as HTMLSpanElement | null;
const survivalZombies = document.querySelector('#survivalZombies') as HTMLSpanElement | null;
const survivalDeathOverlay = document.querySelector('#survivalDeathOverlay') as HTMLDivElement | null;
const survivalRestartBtn = document.querySelector('#survivalRestartBtn') as HTMLButtonElement | null;
const survivalCycleWeapon = document.querySelector('#survivalCycleWeapon') as HTMLButtonElement | null;
const surveyBtn = document.querySelector('#surveyBtn') as HTMLButtonElement | null;
const surveyOverlay = document.querySelector('#surveyOverlay') as HTMLDivElement | null;
const surveyCloseBtn = document.querySelector('#surveyCloseBtn') as HTMLButtonElement | null;
const surveyTerrainBtn = document.querySelector('#surveyTerrainBtn') as HTMLButtonElement | null;
const surveyHydrologyBtn = document.querySelector('#surveyHydrologyBtn') as HTMLButtonElement | null;
const surveyCaptureBtn = document.querySelector('#surveyCaptureBtn') as HTMLButtonElement | null;
const surveyCaptureSize = document.querySelector('#surveyCaptureSize') as HTMLSelectElement | null;
const surveyStatus = document.querySelector('#surveyStatus') as HTMLSpanElement | null;
const minimapHomeDist = document.querySelector('#minimapHomeDist') as HTMLSpanElement;

if (survivalBtn) bindAction(survivalBtn, () => setSurvivalEnabled(!survival.enabled));
if (survivalCycleWeapon) bindAction(survivalCycleWeapon, () => {
  const order: Array<'pistol' | 'shotgun' | 'rifle'> = ['pistol', 'shotgun', 'rifle'];
  const index = order.indexOf(survival.weapon);
  survival.switchWeapon(order[(index + 1) % order.length]);
});
if (survivalRestartBtn) bindAction(survivalRestartBtn, () => {
  survival.restart();
  survivalDeathOverlay?.classList.remove('show');
  setSurvivalEnabled(true);
});

// Mini-Map & Full Map
const miniCanvas = document.querySelector('#miniCanvas') as HTMLCanvasElement;
const mapOverlay = document.querySelector('#mapOverlay') as HTMLDivElement;
const mapCanvas = document.querySelector('#mapCanvas') as HTMLCanvasElement;
const mapClose = document.querySelector('#mapClose') as HTMLButtonElement;

const minimap = new MinimapSystem(miniCanvas, mapCanvas, mapOverlay);
bindAction(mapClose, () => minimap.setFullMap(false));

// Settings Modal Wiring
const settingsBtn = document.querySelector('#settingsBtn') as HTMLButtonElement;
const settingsOverlay = document.querySelector('#settingsOverlay') as HTMLDivElement;
const settingsClose = document.querySelector('#settingsClose') as HTMLButtonElement;
const sensXSlider = document.querySelector('#sensXSlider') as HTMLInputElement;
const sensYSlider = document.querySelector('#sensYSlider') as HTMLInputElement;
const sensXVal = document.querySelector('#sensXVal') as HTMLSpanElement;
const sensYVal = document.querySelector('#sensYVal') as HTMLSpanElement;
const invertYCheck = document.querySelector('#invertYCheck') as HTMLInputElement;
const camAccelSelect = document.querySelector('#camAccelSelect') as HTMLSelectElement;
const camAccelStrengthSlider = document.querySelector('#camAccelStrengthSlider') as HTMLInputElement;
const camAccelStrengthVal = document.querySelector('#camAccelStrengthVal') as HTMLSpanElement;
const hudCustomizeBtn = document.querySelector('#hudCustomizeBtn') as HTMLButtonElement;
const weatherSelect = document.querySelector('#weatherSelect') as HTMLSelectElement;
const graphicsSelect = document.querySelector('#graphicsSelect') as HTMLSelectElement;
const outfitSelect = document.querySelector('#outfitSelect') as HTMLSelectElement | null;
const characterModelSelect = document.querySelector('#characterModelSelect') as HTMLSelectElement | null;
const lodSelect = document.querySelector('#lodSelect') as HTMLSelectElement | null;

const playerGenderSelect = document.querySelector('#playerGenderSelect') as HTMLSelectElement | null;
const playerRoleSelect = document.querySelector('#playerRoleSelect') as HTMLSelectElement | null;
const playerNameInput = document.querySelector('#playerNameInput') as HTMLInputElement | null;
const profileBadge = document.querySelector('#profileBadge') as HTMLDivElement | null;

let playerProfile: PlayerProfile = {
  name: 'Explorer',
  gender: 'male',
  role: 'explorer',
  coins: 50,
  level: 1,
  skillSurvival: 1,
  skillHusbandry: 1,
  skillBuilding: 1,
  skillCartography: 1,
};

function updateProfileUI() {
  if (profileBadge) {
    const icon = playerProfile.gender === 'female' ? '👩' : '🧑';
    const roleTitle = playerProfile.role.charAt(0).toUpperCase() + playerProfile.role.slice(1);
    profileBadge.textContent = `${icon} ${playerProfile.name} · ${roleTitle} Lv.${playerProfile.level}`;
  }
}

function openSettings(open: boolean) {
  settingsOverlay.classList.toggle('show', open);
  if (open) {
    sensXSlider.value = String(settings.current.sensitivityX);
    sensYSlider.value = String(settings.current.sensitivityY);
    sensXVal.textContent = `${Math.round(settings.current.sensitivityX)}°`;
    sensYVal.textContent = `${Math.round(settings.current.sensitivityY)}°`;
    invertYCheck.checked = settings.current.invertY;
    camAccelSelect.value = settings.current.cameraAcceleration;
    camAccelStrengthSlider.value = String(settings.current.cameraAccelerationStrength);
    camAccelStrengthVal.textContent = `${settings.current.cameraAccelerationStrength.toFixed(1)}×`;
    weatherSelect.value = settings.current.weatherMode;
    graphicsSelect.value = settings.current.graphics;
    if (outfitSelect && settings.current.characterOutfit) {
      outfitSelect.value = settings.current.characterOutfit;
    }
    if (characterModelSelect) {
      characterModelSelect.value = isCharacterModelId(settings.current.characterModel)
        ? settings.current.characterModel
        : initialCharacterModel;
    }
    if (lodSelect && settings.current.lodDetail) {
      lodSelect.value = settings.current.lodDetail;
    }
    if (playerGenderSelect && settings.current.characterGender) {
      playerGenderSelect.value = settings.current.characterGender;
    }
    if (playerNameInput) playerNameInput.value = playerProfile.name;
    if (playerRoleSelect) playerRoleSelect.value = playerProfile.role;
  }
}
bindAction(settingsBtn, () => openSettings(true));
bindAction(settingsClose, () => openSettings(false));
bindAction(hudCustomizeBtn, () => setHudEditMode(true));

if (playerGenderSelect) {
  playerGenderSelect.addEventListener('change', () => {
    const g = playerGenderSelect.value as 'male' | 'female';
    playerProfile.gender = g;
    settings.update({ characterGender: g });
    player.setGender(g);
    updateProfileUI();
    say(`Character Gender: ${g === 'male' ? '♂ Male' : '♀ Female'}`);
  });
}

if (characterModelSelect) {
  characterModelSelect.value = initialCharacterModel;
  characterModelSelect.addEventListener('change', () => {
    const modelId = characterModelSelect.value;
    if (!isCharacterModelId(modelId)) return;
    settings.update({ characterModel: modelId });
    player.setCharacterModel(modelId);
    say(`Character model: ${PLAYER_CHARACTER_MODELS[modelId].label}`);
  });
}

if (playerNameInput) {
  playerNameInput.addEventListener('input', () => {
    playerProfile.name = playerNameInput.value.trim() || 'Explorer';
    updateProfileUI();
  });
}

if (playerRoleSelect) {
  playerRoleSelect.addEventListener('change', () => {
    playerProfile.role = playerRoleSelect.value as any;
    updateProfileUI();
    say(`Life Class: ${playerRoleSelect.value.toUpperCase()}`);
  });
}

// Living Ecosystem Sanctuary Census Modal
const ecoBtn = document.querySelector('#ecoBtn') as HTMLButtonElement | null;
const ecoOverlay = document.querySelector('#ecoOverlay') as HTMLDivElement | null;
const ecoClose = document.querySelector('#ecoClose') as HTMLButtonElement | null;
const ecoCensusList = document.querySelector('#ecoCensusList') as HTMLDivElement | null;
const ecoTotalCount = document.querySelector('#ecoTotalCount') as HTMLSpanElement | null;
const ecoExtinctCount = document.querySelector('#ecoExtinctCount') as HTMLSpanElement | null;

function renderEcoCensus() {
  if (!fauna || !ecoCensusList) return;
  const census = fauna.speciesCensus();
  let totalAnimals = 0;
  let extinctSpecies = 0;

  ecoCensusList.innerHTML = Object.entries(census)
    .map(([sp, data]) => {
      const s = sp as Species;
      totalAnimals += data.total;
      if (data.total === 0) extinctSpecies++;
      return `
        <div class="ecoRow">
          <div class="ecoRowTitle">
            <span>${SPECIES_ICON[s]}</span>
            <span>${SPECIES_NAME[s]}</span>
          </div>
          <div class="ecoRowStats">
            <span>♂ ${data.males}</span>
            <span>♀ ${data.females}</span>
            <span>🐣 ${data.babies}</span>
            <span>Total: <b>${data.total}</b></span>
            <span class="ecoStatusTag ${data.status.replace(/\s+/g, '-')}">${data.status}</span>
          </div>
        </div>
      `;
    })
    .join('');

  if (ecoTotalCount) ecoTotalCount.textContent = `Total Fauna: ${totalAnimals}`;
  if (ecoExtinctCount) ecoExtinctCount.textContent = extinctSpecies > 0 ? `🚨 ${extinctSpecies} Extinct!` : `🌿 Balance: Healthy`;
}

if (ecoBtn) {
  bindAction(ecoBtn, () => {
    renderEcoCensus();
    ecoOverlay?.classList.add('show');
  });
}
if (ecoClose) {
  bindAction(ecoClose, () => ecoOverlay?.classList.remove('show'));
}

if (outfitSelect) {
  outfitSelect.addEventListener('change', () => {
    const o = outfitSelect.value as any;
    settings.update({ characterOutfit: o });
    player.applyOutfit(o);
    say(`Outfit: ${o.toUpperCase()}`);
  });
}

if (lodSelect) {
  lodSelect.addEventListener('change', () => {
    const l = lodSelect.value as any;
    settings.update({ lodDetail: l });
    if (terrainShader) {
      terrainShader.uniforms.uDispScale.value = l === 'fast' ? 0.0 : l === 'balanced' ? 0.5 : 1.0;
    }
    chunks.rebuildAll();
    say(`Terrain Detail: ${l.toUpperCase()}`);
  });
}

sensXSlider.addEventListener('input', () => {
  const v = parseFloat(sensXSlider.value);
  settings.update({ sensitivityX: v });
  sensXVal.textContent = `${Math.round(v)}°`;
});
sensYSlider.addEventListener('input', () => {
  const v = parseFloat(sensYSlider.value);
  settings.update({ sensitivityY: v });
  sensYVal.textContent = `${Math.round(v)}°`;
});
invertYCheck.addEventListener('change', () => {
  settings.update({ invertY: invertYCheck.checked });
});
camAccelSelect.addEventListener('change', () => {
  settings.update({ cameraAcceleration: camAccelSelect.value as 'fixed' | 'distance' | 'speed' });
});
camAccelStrengthSlider.addEventListener('input', () => {
  const v = parseFloat(camAccelStrengthSlider.value);
  settings.update({ cameraAccelerationStrength: v });
  camAccelStrengthVal.textContent = `${v.toFixed(1)}×`;
});
weatherSelect.addEventListener('change', () => {
  settings.update({ weatherMode: weatherSelect.value as any });
  say(`Weather set to ${weatherSelect.value}`);
});
graphicsSelect.addEventListener('change', () => {
  const g = graphicsSelect.value as 'low' | 'med' | 'high';
  settings.update({ graphics: g });
  renderer.shadowMap.enabled = g !== 'low';
  sun.castShadow = g !== 'low';
  renderer.setPixelRatio(Math.min(devicePixelRatio, g === 'low' ? 1.0 : g === 'med' ? 1.3 : 1.6));
  say(`Graphics preset: ${g.toUpperCase()}`);
});

// Home Upgrade Modal Wiring
const upgradeOverlay = document.querySelector('#upgradeOverlay') as HTMLDivElement;
const upgradeClose = document.querySelector('#upgradeClose') as HTMLButtonElement;
const upgradeCurrentLevel = document.querySelector('#upgradeCurrentLevel') as HTMLDivElement;
const upgradeDesc = document.querySelector('#upgradeDesc') as HTMLParagraphElement;
const upgradeCosts = document.querySelector('#upgradeCosts') as HTMLDivElement;
const upgradeBtn = document.querySelector('#upgradeBtn') as HTMLButtonElement;

function openHomeWorkshop(open: boolean) {
  upgradeOverlay.classList.toggle('show', open);
  if (!open) return;

  const cur = chunks.homeLevel;
  upgradeCurrentLevel.textContent = `Current: Level ${cur} · ${HOME_UPGRADE_COSTS[cur].title}`;

  if (cur >= 3) {
    upgradeDesc.textContent = 'Your Mountain Manor is fully upgraded! Enjoy your grand lodge and stone hearth.';
    upgradeCosts.innerHTML = '<span class="costBadge met">★ Max Level Reached</span>';
    upgradeBtn.disabled = true;
    upgradeBtn.textContent = 'MAX LEVEL';
    return;
  }

  const nextLevel = (cur + 1) as HomeLevel;
  const cost = HOME_UPGRADE_COSTS[nextLevel];
  upgradeDesc.textContent = `Upgrade to: ${cost.title}`;

  const hasWood = (inventory['Wood'] || 0) + (inventory['Pine Wood'] || 0);
  const hasStone = inventory['Stone'] || 0;
  const hasOre = inventory['Ore'] || 0;

  const woodOk = hasWood >= cost.wood;
  const stoneOk = hasStone >= cost.stone;
  const oreOk = cost.ore === 0 || hasOre >= cost.ore;
  const canAfford = woodOk && stoneOk && oreOk;

  upgradeCosts.innerHTML = `
    <span class="costBadge ${woodOk ? 'met' : 'missing'}">🪵 Wood: ${hasWood}/${cost.wood}</span>
    <span class="costBadge ${stoneOk ? 'met' : 'missing'}">🪨 Stone: ${hasStone}/${cost.stone}</span>
    ${cost.ore > 0 ? `<span class="costBadge ${oreOk ? 'met' : 'missing'}">⛏️ Ore: ${hasOre}/${cost.ore}</span>` : ''}
  `;

  upgradeBtn.disabled = !canAfford;
  upgradeBtn.textContent = canAfford ? 'UPGRADE HOME NOW' : 'NEED MORE MATERIALS';
}

bindAction(upgradeClose, () => openHomeWorkshop(false));
bindAction(upgradeBtn, () => {
  const nextLevel = (chunks.homeLevel + 1) as HomeLevel;
  const cost = HOME_UPGRADE_COSTS[nextLevel];
  if (!cost) return;

  // Deduct wood
  let woodNeeded = cost.wood;
  const standardWood = inventory['Wood'] || 0;
  if (standardWood >= woodNeeded) {
    inventory['Wood'] -= woodNeeded;
  } else {
    woodNeeded -= standardWood;
    inventory['Wood'] = 0;
    inventory['Pine Wood'] = Math.max(0, (inventory['Pine Wood'] || 0) - woodNeeded);
  }

  inventory['Stone'] = Math.max(0, (inventory['Stone'] || 0) - cost.stone);
  if (cost.ore > 0) inventory['Ore'] = Math.max(0, (inventory['Ore'] || 0) - cost.ore);

  chunks.homeLevel = nextLevel;
  chunks.rebuildHome();
  renderInventory();
  saveNow();
  openHomeWorkshop(false);
  say(`🎉 Home upgraded to ${HOME_UPGRADE_COSTS[nextLevel].title}!`);
});

// Fullscreen with graceful fallback for iframes
const fullscreenBtn = document.querySelector('#fullscreenBtn') as HTMLButtonElement;
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      say('Exit fullscreen');
    } else if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
      say('Fullscreen mode');
    } else {
      throw new Error('Native fullscreen not available');
    }
  } catch {
    const isSim = document.body.classList.toggle('simulated-fullscreen');
    say(isSim ? '⛶ Fullscreen view enabled' : '⛶ Standard view');
  }
}
bindAction(fullscreenBtn, toggleFullscreen);

// --- WORLD SURVEY: AUTHORITATIVE TOPOLOGY + HYDROLOGY DIAGNOSTICS ---
let surveyWasFog: THREE.Scene['fog'] = gameplayFog;
function updateSurveyUI() {
  if (surveyOverlay) surveyOverlay.classList.toggle('show', survey.isActive);
  if (surveyTerrainBtn) surveyTerrainBtn.classList.toggle('active', survey.currentView === 'terrain');
  const surveyWorldBtn = document.querySelector('#surveyWorldBtn') as HTMLButtonElement | null;
  if (surveyWorldBtn) surveyWorldBtn.classList.toggle('active', survey.currentView === 'world');
  if (surveyHydrologyBtn) surveyHydrologyBtn.classList.toggle('active', survey.currentView === 'hydrology');
  if (surveyStatus) surveyStatus.textContent = survey.currentView === 'world'
    ? 'FULL WORLD · ALL RENDERED'
    : survey.currentView === 'terrain'
      ? 'ROCK + WATER · TOPOLOGY'
      : 'WATER TRUTH · FLOW';
}
let surveyOpening = false;

function setSurveyLoading(stage: string, progress: number) {
  const loader = document.querySelector('#surveyLoading') as HTMLElement | null;
  const stageEl = document.querySelector('#surveyLoadingStage') as HTMLElement | null;
  const bar = document.querySelector('#surveyLoadingBar') as HTMLElement | null;
  if (loader) loader.classList.add('show');
  if (stageEl) stageEl.textContent = stage;
  if (bar) bar.style.width = String(Math.round(clamp(progress, 0, 1) * 100)) + '%';
}

function hideSurveyLoading() {
  const loader = document.querySelector('#surveyLoading') as HTMLElement | null;
  if (loader) loader.classList.remove('show');
}

function setSurveyMode(active: boolean) {
  if (active) {
    if (surveyOpening || survey.isActive) return;
    surveyOpening = true;
    isPhotoMode = false;
    document.body.classList.remove('photo-mode-active', 'photo-clean-mode');

    // Show the survey shell + loader BEFORE the expensive world materialization.
    // The browser gets a chance to paint this overlay between chunk batches.
    document.body.classList.add('survey-active');
    if (surveyOverlay) surveyOverlay.classList.add('show');
    setSurveyLoading('CALCULATING…', 0.02);

    survey.setActive(true);
    world.visible = true;
    actors.visible = true;
    celestialGroup.visible = true;
    // Survey is the finite world only. The distant horizon is an old extended-terrain
    // background and must not leak a second procedural world outside the boundary.
    distantHorizonMesh.visible = false;
    // WORLD survey is an inspection/capture mode: the atmospheric cloud deck must not occlude the finite world.
    cloudDeckGroup.visible = false;
    splashRing.visible = false;
    surveyWasFog = scene.fog;
    scene.fog = null;
    scene.background = new THREE.Color(0x090d12);
    updateSurveyUI();

    void (async () => {
      try {
        await chunks.surveyAll(true, (done, total) => {
          setSurveyLoading('CALCULATING…', 0.02 + (done / Math.max(1, total)) * 0.68);
        });

        setSurveyLoading('RENDERING…', 0.78);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

        setSurveyLoading('OPENING…', 0.94);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

        updateSurveyUI();
        hideSurveyLoading();
        say('World Survey · drag to orbit · two fingers pan/zoom · tap a place to focus');
      } catch (err) {
        console.error('World survey failed to open:', err);
        hideSurveyLoading();
        setSurveyMode(false);
        say('World Survey failed to open');
      } finally {
        surveyOpening = false;
      }
    })();
  } else {
    surveyOpening = false;
    hideSurveyLoading();
    survey.setActive(false);
    void chunks.surveyAll(false);
    world.visible = true;
    actors.visible = true;
    celestialGroup.visible = true;
    distantHorizonMesh.visible = true;
    cloudDeckGroup.visible = true;
    splashRing.visible = false;
    scene.background = skyColor;
    scene.fog = surveyWasFog;
    document.body.classList.remove('survey-active');
    if (surveyOverlay) surveyOverlay.classList.remove('show');
  }
}
function setSurveyView(view: SurveyView) {
  survey.setView(view);
  if (survey.isActive) world.visible = view === 'world';
  updateSurveyUI();
}
function captureSurvey() {
  const value = surveyCaptureSize?.value || '1920x1080';
  const [w, h] = value.split('x').map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return;
  try {
    document.body.classList.add('taking-screenshot');
    const dataUrl = survey.capture(renderer, w, h);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `world-survey-${survey.currentView}-${w}x${h}-${ts}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showPhotoToast(`Survey capture saved · ${w}×${h}`);
  } catch (err) {
    console.error('World survey capture failed:', err);
    showPhotoToast('Survey capture failed · try a smaller size');
  } finally {
    document.body.classList.remove('taking-screenshot');
  }
}
if (surveyBtn) bindAction(surveyBtn, () => setSurveyMode(true));
if (surveyCloseBtn) bindAction(surveyCloseBtn, () => setSurveyMode(false));
if (!document.querySelector('#surveyWorldBtn')) {
  const viewButtons = document.querySelector('.surveyViewButtons');
  if (viewButtons) {
    const worldButton = document.createElement('button');
    worldButton.id = 'surveyWorldBtn';
    worldButton.className = 'surveyModeBtn active';
    worldButton.textContent = '🌍 WORLD';
    viewButtons.prepend(worldButton);
  }
}
const surveyWorldBtn = document.querySelector('#surveyWorldBtn') as HTMLButtonElement | null;
if (surveyWorldBtn) bindAction(surveyWorldBtn, () => setSurveyView('world'));
if (surveyTerrainBtn) bindAction(surveyTerrainBtn, () => setSurveyView(survey.currentView === 'terrain' ? 'world' : 'terrain'));
if (surveyHydrologyBtn) bindAction(surveyHydrologyBtn, () => setSurveyView(survey.currentView === 'hydrology' ? 'world' : 'hydrology'));
if (surveyCaptureBtn) bindAction(surveyCaptureBtn, captureSurvey);
window.addEventListener('keydown', e => {
  if (survey.isActive) {
    if (e.key === 'Escape') {
      setSurveyMode(false);
      return;
    }
    if (e.key === '+' || e.key === '=') survey.zoom(-90);
    if (e.key === '-' || e.key === '_') survey.zoom(90);
  }
});

// --- PHOTO MODE: CLEAN SCREENSHOT TAKING & LOCAL DOWNLOAD ---
const photoBtn = document.querySelector('#photoBtn') as HTMLButtonElement | null;
const photoCloseBtn = document.querySelector('#photoCloseBtn') as HTMLButtonElement | null;
const photoGridBtn = document.querySelector('#photoGridBtn') as HTMLButtonElement | null;
const photoSnapBtn = document.querySelector('#photoSnapBtn') as HTMLButtonElement | null;
const photoCleanBtn = document.querySelector('#photoCleanBtn') as HTMLButtonElement | null;
const photoTimeBadge = document.querySelector('#photoTimeBadge') as HTMLSpanElement | null;
const photoCamBadge = document.querySelector('#photoCamBadge') as HTMLSpanElement | null;
const photoGrid = document.querySelector('#photoGrid') as HTMLDivElement | null;
const photoFlash = document.querySelector('#photoFlash') as HTMLDivElement | null;
const photoToast = document.querySelector('#photoToast') as HTMLDivElement | null;

let isPhotoMode = false;
let isPhotoClean = false;

function showPhotoToast(msg: string) {
  if (!photoToast) return;
  photoToast.textContent = msg;
  photoToast.classList.add('show');
  setTimeout(() => photoToast.classList.remove('show'), 2800);
}

function updatePhotoBadges() {
  if (photoTimeBadge) {
    const hour = Math.floor(worldTime);
    const minute = Math.floor((worldTime - hour) * 60);
    photoTimeBadge.textContent = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  if (photoCamBadge) {
    photoCamBadge.textContent = `${Math.round(camera.fov)}° FOV`;
  }
}

function setPhotoMode(active: boolean) {
  isPhotoMode = active;
  isPhotoClean = false;
  document.body.classList.toggle('photo-mode-active', active);
  document.body.classList.remove('photo-clean-mode');

  if (active) {
    updatePhotoBadges();
    say('📷 Photo Mode: Press CAPTURE / Space to take screenshot · Esc or P to exit');
  } else {
    say('Returned to game');
  }
}

function togglePhotoMode() {
  setPhotoMode(!isPhotoMode);
}

function takeScreenshot() {
  // 1. Hide all HUD & photo overlays completely for clean screenshot taking
  document.body.classList.add('taking-screenshot');

  // 2. Render fresh clean frame with Three.js renderer
  renderer.render(scene, camera);

  // 3. Shutter flash effect
  if (photoFlash) {
    photoFlash.classList.add('flash');
    requestAnimationFrame(() => {
      setTimeout(() => photoFlash.classList.remove('flash'), 50);
    });
  }

  // 4. Capture canvas as high-res PNG and save to browser download
  try {
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = dataUrl;
    a.download = `wildlife-screenshot-${ts}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showPhotoToast('📸 Screenshot saved to downloads!');
    say('Screenshot saved to your downloads!');
  } catch (err) {
    console.error('Screenshot capture failed:', err);
    showPhotoToast('⚠️ Could not save screenshot');
  } finally {
    document.body.classList.remove('taking-screenshot');
  }
}

if (photoBtn) bindAction(photoBtn, () => setPhotoMode(!isPhotoMode));
if (photoCloseBtn) bindAction(photoCloseBtn, () => setPhotoMode(false));
if (photoSnapBtn) bindAction(photoSnapBtn, takeScreenshot);

if (photoGridBtn && photoGrid) {
  bindAction(photoGridBtn, () => {
    photoGrid.classList.toggle('hidden');
  });
}

if (photoCleanBtn) {
  bindAction(photoCleanBtn, () => {
    isPhotoClean = !isPhotoClean;
    document.body.classList.toggle('photo-clean-mode', isPhotoClean);
  });
}

// Tap anywhere when in clean preview mode to restore controls
window.addEventListener('click', e => {
  if (isPhotoMode && isPhotoClean) {
    isPhotoClean = false;
    document.body.classList.remove('photo-clean-mode');
  }
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (isPhotoMode) {
      if (isPhotoClean) {
        isPhotoClean = false;
        document.body.classList.remove('photo-clean-mode');
      } else {
        setPhotoMode(false);
      }
      return;
    }
    openSettings(false);
    minimap.setFullMap(false);
    openHomeWorkshop(false);
  }
  if (isPhotoMode && (e.key === ' ' || e.key === 'Enter') && !e.repeat) {
    e.preventDefault();
    takeScreenshot();
  }
});

let promptTimer = 0, sprintToggle = false, mapAccumulator = 0, uiAccumulator = 0;

function say(t: string) {
  prompt.textContent = t;
  prompt.classList.add('show');
  promptTimer = 1.35;
}

// Maximo-style jump constants (tuned to world scale where old impulse was 7.4)
const JUMP_FORCE = 11.2;
const GRAVITY = 26;
const FALL_MULTIPLIER = 2.25;
const LOW_JUMP_MULTIPLIER = 1.85;
const MAX_FALL_SPEED = -38;

function jump() {
  if (player.swimming) {
    player.velocity.y = 2.1;
    return;
  }
  if (player.onGround) {
    player.velocity.y = JUMP_FORCE;
    player.onGround = false;
    player.playJump();
  }
}

function addItem(item: string, qty: number) {
  inventory[item] = (inventory[item] || 0) + qty;
  renderInventory();
  saveNow();
}

function renderInventory() {
  inventoryEl.innerHTML = Object.entries(inventory)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `<span class="invItem">${ITEM_ICONS[k] || '•'} ${v}</span>`)
    .join('');
}
renderInventory();

fauna = new WildlifeSystem({
  heightAt: terrainHeightAt,
  waterAt,
  roadAt,
  nearHome,
  biomeAt,
  chunkSize: SIZE,
  trust: save.wildlifeTrust ?? {},
  hasFruit: () => Boolean(inventory.Fruit),
  consumeFruit: () => {
    inventory.Fruit = Math.max(0, (inventory.Fruit || 0) - 1);
    renderInventory();
    saveNow();
  },
  onTrustChange: saveNow,
  notify: say,
  faunaContainer: actors,
});

chunks.stream(save.player.x, save.player.z);
void environmentAssets.preload().then(() => {
  chunks.rebuildAll();
});

function hitResource(obj: THREE.Object3D) {
  const res = obj.userData.resource as { kind: ResourceKind; hits: number; maxHits: number };
  const def = RESOURCE_DEFS[res.kind];
  // The production human rig includes a "Working" clip. Play the short
  // inspect/gather emote only while nearly stationary to avoid a sliding-work pose.
  if (Math.hypot(player.velocity.x, player.velocity.z) < 1.0) player.playEmote('inspect');
  res.hits--;
  obj.scale.setScalar(Math.max(0.7, 1 - 0.08 * (res.maxHits - res.hits)));

  if (res.hits > 0) {
    say(`Hit ${res.kind.replace('_', ' ')} (${res.maxHits - res.hits}/${res.maxHits})`);
    return;
  }

  const roll = hash(Math.round(obj.position.x * 97), Math.round(obj.position.z * 131));
  const qty = def.yieldQty[0] + Math.floor(roll * (def.yieldQty[1] - def.yieldQty[0] + 1));
  addItem(def.yieldItem, qty);
  let msg = `Harvested ${qty} ${def.yieldItem}`;

  if (def.bonusItem && def.bonusQty) {
    const bq = def.bonusQty[0] + Math.floor(hash(Math.round(obj.position.z * 97), Math.round(obj.position.x * 131)) * (def.bonusQty[1] - def.bonusQty[0] + 1));
    addItem(def.bonusItem, bq);
    msg += ` + ${bq} ${def.bonusItem}`;
  }

  const q = obj.getWorldPosition(new THREE.Vector3());
  const cx = chunks.coord(q.x), cz = chunks.coord(q.z), key = chunks.key(cx, cz);
  const g = chunks.loaded.get(key);

  if (g) {
    chunks.changes[key] ??= [];
    chunks.changes[key].push(`${obj.name}@${Date.now()}`);
    chunks.unregisterObject(obj);
    g.remove(obj);

    if (def.family === 'tree') {
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x5c4028 }));
      stump.name = obj.name.replace('tree-', 'stump-');
      stump.position.copy(obj.position);
      stump.position.y += 0.15;
      stump.castShadow = true;
      stump.receiveShadow = true;
      g.add(stump);
    } else {
      const rubble = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0x5a5d60 }));
      rubble.name = obj.name.replace('rock-', 'rubble-');
      rubble.position.copy(obj.position);
      rubble.position.y += 0.07;
      rubble.castShadow = true;
      rubble.receiveShadow = true;
      g.add(rubble);
    }
  }
  say(msg);
  saveNow();
}

const aimRay = new THREE.Raycaster();
const cameraRay = new THREE.Raycaster();
const aimNdc = new THREE.Vector2();
const aimObjects: THREE.Object3D[] = [];
const aimHits: THREE.Intersection[] = [];
let aimCache: THREE.Object3D | null = null, aimTimer = 0;
let combatAimCache: THREE.Object3D | null = null, combatAimTimer = 0;
const combatMarkerWorld = new THREE.Vector3();

function getAimTarget(force = false, combat = false): THREE.Object3D | null {
  const cache = combat ? combatAimCache : aimCache;
  const timer = combat ? combatAimTimer : aimTimer;
  if (!force && timer > 0) return cache;
  if (combat) combatAimTimer = LOW_POWER_MODE ? 0.10 : 0.05;
  else aimTimer = LOW_POWER_MODE ? 0.10 : 0.05;

  const pp = player.root.position;
  aimObjects.length = 0;
  for (const o of chunks.aimTargets) aimObjects.push(o);
  fauna?.targetObjects(aimObjects);

  if (mode === 'tpp') {
    // Call of Duty Battle Royale style character-centric action volume
    // Focuses on nearby objects within character interaction reach (~3.2m)
    let bestObj: THREE.Object3D | null = null;
    let bestScore = -Infinity;

    // Player forward facing vector
    const charYaw = player.root.rotation.y;
    const forwardX = Math.sin(charYaw);
    const forwardZ = Math.cos(charYaw);

    for (const o of aimObjects) {
      if (!o.visible || !o.parent) continue;
      const ox = o.matrixWorld.elements[12];
      const oy = o.matrixWorld.elements[13];
      const oz = o.matrixWorld.elements[14];

      const dx = ox - pp.x;
      const dy = oy - pp.y;
      const dz = oz - pp.z;
      const dist = Math.hypot(dx, dz);

      if (dist > (combat ? 6.0 : 3.4) || Math.abs(dy) > (combat ? 3.5 : 2.8)) continue;

      // Facing alignment (-1 to 1)
      const dot = dist > 0.05 ? (dx * forwardX + dz * forwardZ) / dist : 1.0;

      // In TPP: allow anything immediately adjacent (<1.3m), or in forward cone (dot >= 0.28, ~73 deg)
      if (dist > (combat ? 1.8 : 1.3) && dot < (combat ? 0.15 : 0.28)) continue;

      // Score prefers closer objects with high directional alignment
      const score = (1.0 - dist / (combat ? 6.0 : 3.4)) * 2.0 + dot * 1.5;
      if (score > bestScore) {
        bestScore = score;
        bestObj = o;
      }
    }

    if (bestObj) {
      let o = bestObj;
      while (o.parent && o.parent !== world && !o.userData.resource && !o.userData.interactable && !o.userData.animal) o = o.parent;
      return combat ? (combatAimCache = o) : (aimCache = o);
    }
    return combat ? (combatAimCache = null) : (aimCache = null);
  }

  // FPP mode: Precision raycast from camera eye
  aimRay.setFromCamera(aimNdc.set(0, 0), camera);
  aimHits.length = 0;
  const hit = aimRay.intersectObjects(aimObjects, true, aimHits)[0];
  if (!hit || hit.distance > (combat ? 10 : 3.8)) return combat ? (combatAimCache = null) : (aimCache = null);
  let o = hit.object;
  while (o.parent && o.parent !== world && !o.userData.resource && !o.userData.interactable && !o.userData.animal) o = o.parent;
  return combat ? (combatAimCache = o) : (aimCache = o);
}

function interact() {
  const o = getAimTarget(true);
  if (!o) {
    say('Aim at something within reach');
    return;
  }
  if (o.userData.animal) {
    fauna?.interact(o);
    return;
  }
  if (o.userData.resource) {
    hitResource(o);
    return;
  }
  const data = o.userData.interactable as { action: string; label: string } | undefined;
  if (!data) {
    say('Nothing to use here');
    return;
  }

  if (data.action === 'toggleDoor') {
    const h = chunks.loaded.get('0,0')?.getObjectByName('home') as THREE.Group | null;
    if (!h) return;
    const open = !Boolean(h.userData.doorOpen);
    h.userData.doorOpen = open;
    const changes = chunks.changes['0,0'] ?? (chunks.changes['0,0'] = []);
    const i = changes.indexOf('door-open');
    if (open && i < 0) changes.push('door-open');
    if (!open && i >= 0) changes.splice(i, 1);
    o.rotation.y = open ? -Math.PI / 2 : 0;
    saveNow();
    say(open ? 'Door opened' : 'Door closed');
    return;
  }

  if (data.action === 'homeWorkshop') {
    openHomeWorkshop(true);
    return;
  }

  if (data.action === 'rest') {
    // Rest in bed: advance world time to dawn 06:30
    worldTime = 6.5;
    player.root.position.set(HOME_X - 1.2, terrainHeightAt(HOME_X, HOME_Z) + 0.2, HOME_Z);
    say('🌅 Rested peacefully till sunrise! Energy restored.');
    saveNow();
    return;
  }

  say(`USE · ${data.label}`);
}

const clock = new THREE.Clock();
let autosave = 0, lastCx = 999, lastCz = 999, walkTime = 0;
let lastPlayerYaw = 0;

function thisCoord(v: number) {
  return Math.floor(v / SIZE);
}

function canOccupy(x: number, z: number) {
  const playerRadius = 0.34;
  if (Math.abs(thisCoord(x)) > WORLD_RADIUS || Math.abs(thisCoord(z)) > WORLD_RADIUS) return false;
  const pcx = chunks.coord(x), pcz = chunks.coord(z);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const g = chunks.loaded.get(chunks.key(pcx + ox, pcz + oz));
      if (!g) continue;
      const home = g.getObjectByName('home') as THREE.Group | null;
      const box = home?.userData.collider as { minX: number; maxX: number; minZ: number; maxZ: number; doorMinX: number; doorMaxX: number; wallThickness: number } | undefined;
      if (box && home) {
        const inside = x + playerRadius > box.minX && x - playerRadius < box.maxX && z + playerRadius > box.minZ && z - playerRadius < box.maxZ;
        if (inside) {
          const nearLeft = x - box.minX < box.wallThickness + playerRadius;
          const nearRight = box.maxX - x < box.wallThickness + playerRadius;
          const nearBack = z - box.minZ < box.wallThickness + playerRadius;
          const nearFront = box.maxZ - z < box.wallThickness + playerRadius;
          const doorOpen = Boolean(home.userData.doorOpen);
          const inDoor = doorOpen && x > box.doorMinX - playerRadius && x < box.doorMaxX + playerRadius;
          if (nearLeft || nearRight || nearBack || (nearFront && !inDoor)) return false;
        }
      }
      for (const o of g.children) {
        const r = o.userData.colliderRadius as number | undefined;
        if (!r) continue;
        const rr = r + playerRadius;
        const dx = x - o.position.x;
        const dz = z - o.position.z;
        if (dx * dx + dz * dz < rr * rr) return false;
      }
    }
  }
  return true;
}

let modeBeforeSurvival: Mode = mode;

function setSurvivalEnabled(enabled: boolean) {
  if (enabled) {
    if (!survival.enabled) modeBeforeSurvival = mode;
    survival.setEnabled(true);
    survival.setAmbientEnabled(true);
    mode = 'fpp';
    document.body.classList.add('survival-mode');
    if (survivalBtn) {
      survivalBtn.textContent = '🛡️';
      survivalBtn.title = 'Leave Zombie Survival';
      survivalBtn.setAttribute('aria-label', 'Leave Zombie Survival Mode');
    }
    target.style.display = 'grid';
  } else {
    survival.setEnabled(false);
    adsToggleOn = false;
    document.body.classList.remove('aim-active');
    mode = modeBeforeSurvival;
    document.body.classList.remove('survival-mode', 'survival-damaged');
    survivalDeathOverlay?.classList.remove('show');
    if (survivalBtn) {
      survivalBtn.textContent = '🧟';
      survivalBtn.title = 'Enter Zombie Survival';
      survivalBtn.setAttribute('aria-label', 'Enter Zombie Survival Mode');
    }
  }
  saveNow();
}

let sightBlockerCacheKey = '';
let sightBlockerCache: THREE.Object3D[] = [];

survival = new ZombieSurvivalSystem({
  scene,
  camera,
  getPlayerPosition: () => player.root.position,
  getTerrainHeight: terrainHeightAt,
  isWater: waterAt,
  getWaterDepth: waterDepthAt,
  canOccupy: (x, z) => canOccupy(x, z),
  getSightBlockers: () => {
    const pcx = chunks.coord(player.root.position.x), pcz = chunks.coord(player.root.position.z);
    const cacheX = Math.floor(player.root.position.x / 8);
    const cacheZ = Math.floor(player.root.position.z / 8);
    const nearby: string[] = [];
    for (let ox = -2; ox <= 2; ox++) {
      for (let oz = -2; oz <= 2; oz++) {
        const key = chunks.key(pcx + ox, pcz + oz);
        const chunk = chunks.loaded.get(key);
        if (chunk) nearby.push(`${key}:${chunk.uuid}`);
      }
    }
    // Cache the scene-graph walk. Automatic fire can call this many times per second on mobile.
    const cacheKey = `${pcx}:${pcz}:${cacheX}:${cacheZ}:${chunks.loaded.size}:${chunks.cameraBlockers.size}:${nearby.join('|')}`;
    if (cacheKey !== sightBlockerCacheKey) {
      // Only nearby colliders can matter for the initial 15–25 m hostile encounters.
      // A 50 m margin covers chunk-edge movement while avoiding ray-testing every distant prop.
      const blockers = new Set<THREE.Object3D>();
      const blockerPosition = new THREE.Vector3();
      const playerPosition = player.root.position;
      for (const object of chunks.cameraBlockers) {
        if (!object.visible || !object.parent) continue;
        object.getWorldPosition(blockerPosition);
        if (blockerPosition.distanceToSquared(playerPosition) <= 2500) blockers.add(object);
      }
      for (let ox = -2; ox <= 2; ox++) {
        for (let oz = -2; oz <= 2; oz++) {
          const chunk = chunks.loaded.get(chunks.key(pcx + ox, pcz + oz));
          if (!chunk) continue;
          const terrain = chunk.getObjectByName('terrain');
          if (terrain) blockers.add(terrain);
          chunk.traverse(object => {
            if (object === chunk || object === terrain) return;
            const hasPhysicalMarker = Boolean(
              object.userData.colliderRadius ||
              object.userData.collider ||
              object.userData.resource ||
              object.userData.interactable
            );
            if (hasPhysicalMarker) blockers.add(object);
          });
        }
      }
      sightBlockerCache = [...blockers];
      sightBlockerCacheKey = cacheKey;
    }
    // Do not let hidden or unloaded resources block bullets.
    const isVisibleInWorld = (object: THREE.Object3D) => {
      let node: THREE.Object3D | null = object;
      while (node) {
        if (!node.visible) return false;
        node = node.parent;
      }
      return object.parent !== null;
    };
    return sightBlockerCache.filter(isVisibleInWorld);
  },
  safeZones: [
    { id: 'homestead', label: 'HOMESTEAD', x: HOME_X, z: HOME_Z, radius: 12 },
    { id: 'settlement', label: 'SETTLEMENT', x: VILLAGE_X, z: VILLAGE_Z, radius: 13 },
  ],
  lowPowerMode: LOW_POWER_MODE,
  respawnPlayer: () => {
    const x = HOME_X + 2.8, z = HOME_Z + 7.2;
    player.root.position.set(x, physicalGroundHeightAt(x, z) + 0.2, z);
    player.velocity.set(0, 0, 0);
    player.onGround = true;
    player.swimming = false;
    mode = 'fpp';
    camYaw = player.root.rotation.y;
    targetYaw = camYaw;
    camPitch = 0;
    targetPitch = 0;
    saveNow();
  },
  notify: message => { if (message) say(message); },
  onStatus: (state: SurvivalStatus) => {
    if (survivalHealthText) survivalHealthText.textContent = `${state.health} / ${state.maxHealth}`;
    if (survivalHealthBar) {
      survivalHealthBar.style.width = `${Math.max(0, Math.min(100, (state.health / state.maxHealth) * 100))}%`;
      survivalHealthBar.style.background = state.health <= 25 ? '#ef4444' : state.health <= 50 ? '#f59e0b' : 'linear-gradient(90deg, #e87942, #f5c26b)';
    }
    if (survivalWeapon) survivalWeapon.textContent = state.weaponLabel;
    if (survivalAmmo) survivalAmmo.textContent = String(state.ammoInMag).padStart(2, '0');
    if (survivalReserve) survivalReserve.textContent = state.reloading ? 'RELOADING' : `/ ${state.ammoReserve}`;
    if (survivalKills) survivalKills.textContent = `KILLS ${state.kills}`;
    if (survivalWave) survivalWave.textContent = state.wave ? `WAVE ${state.wave}` : 'SAFE START';
    if (survivalZombies) survivalZombies.textContent = state.livingZombies ? `${state.livingZombies} INFECTED` : '';
    if (survivalZoneStatus) {
      survivalZoneStatus.textContent = state.inSafeZone ? `SAFE · ${state.nearestZone}` : `DANGER · ${state.nearestZone} ${Math.round(state.zoneDistance)}m`;
      survivalZoneStatus.classList.toggle('safe', state.inSafeZone);
      survivalZoneStatus.classList.toggle('danger', !state.inSafeZone);
    }
  },
  onDamage: () => {
    document.body.classList.add('survival-damaged');
    window.setTimeout(() => document.body.classList.remove('survival-damaged'), 230);
  },
  onDeath: () => {
    keys.clear();
    keyboardKeys.clear();
    pointerKeys.clear();
    survivalDeathOverlay?.classList.add('show');
    if (document.pointerLockElement) document.exitPointerLock();
  },
});

setSurvivalEnabled(true);

// Pointer/touch interaction is the browser-safe point to unlock procedural Web Audio.
// Capture phase makes this work for the joystick and HUD buttons as well as the canvas.
window.addEventListener('pointerdown', () => {
  if (survival?.enabled) survival.activateAudio();
}, { capture: true, passive: true });

function moveWithCollisions(dx: number, dz: number) {
  const p = player.root.position;
  const nx = p.x + dx, nz = p.z + dz;
  if (canOccupy(nx, nz)) {
    p.x = nx;
    p.z = nz;
    return;
  }
  if (canOccupy(nx, p.z)) p.x = nx;
  if (canOccupy(p.x, nz)) p.z = nz;
}

const moveForward = new THREE.Vector3();
const moveRight = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const cameraFocus = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
const cameraEye = new THREE.Vector3();
const cameraLook = new THREE.Vector3();
const cameraBlockerObjects: THREE.Object3D[] = [];
const cameraHits: THREE.Intersection[] = [];
let cameraProbeTimer = 0, cameraClearance = camDistance;

function input() {
  let x = joy.x, y = joy.y;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  const l = Math.hypot(x, y);
  return l > 1 ? { x: x / l, y: y / l } : { x, y };
}

function update(dt: number) {
  if (survey.isActive) {
    // Survey is a frozen world snapshot: no weather, fauna, physics, terrain
    // streaming, or other live simulation advances while the user inspects it.
    return;
  }
  if (survival?.enabled && survival.isDead) {
    survival.update(dt, false, false);
    return;
  }
  aimTimer = Math.max(0, aimTimer - dt);
  combatAimTimer = Math.max(0, combatAimTimer - dt);

  // Time cycle: 24h cycle
  worldTime = (worldTime + dt * 0.04) % 24;

  const weatherEffects = weather.update(dt, player.root.position, settings.current.weatherMode, worldTime);
  updateSky(dt, weatherEffects.skyDim, weatherEffects.lightningFlash);

  if (waterShader) {
    waterShader.uniforms.uTime.value += dt * weatherEffects.waveSpeed;
    waterShader.uniforms.uWaveHeight.value = weatherEffects.waveHeight;
    waterShader.uniforms.uWindDir.value.copy(weatherEffects.windVector);
  }
  if (terrainShader) terrainShader.uniforms.uTime.value += dt;
  updateSplash(dt);
  updateMagicEffects(dt);

  // Keep scattered cloud clusters nearby without covering the sky.
  cloudDeckGroup.position.set(player.root.position.x, weatherEffects.cloudBaseAltitude, player.root.position.z);
  cloudDeckMat.opacity = clamp(0.19 + weatherEffects.skyDim * 0.10, 0.16, 0.30);
  cloudDeckGroup.rotation.y += dt * 0.0015;

  const wasSwimming = player.swimming;
  const p = player.root.position;
  const worldFields = queryWorldFields(p.x, p.z);
  const wDepth = worldFields.waterDepth;
  player.swimming = wDepth > 0.65;
  const isWading = wDepth > 0.05 && !player.swimming;

  // Water wake: rings spread from the player while wading or swimming, stronger when moving.
  const wakeSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  waterWake.set(p.x, p.z, wDepth > 0.05 ? clamp(0.25 + wakeSpeed * 0.25, 0, 1.2) : 0);

  // Slope resistance & downhill agility
  const slope = worldFields.slope;
  let slopeSpeedMultiplier = 1.0;

  const iv = input();
  const forward = moveForward.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  const right = moveRight.set(-Math.cos(camYaw), 0, Math.sin(camYaw));
  const dir = moveDirection.set(0, 0, 0).addScaledVector(right, iv.x).addScaledVector(forward, -iv.y);
  const inputMagnitude = Math.min(1, dir.length());
  const hasInput = inputMagnitude > 0.08;
  // Push the virtual stick into its outer ring to sprint without a separate run button.
  const joystickSprint = joyActive && Math.hypot(joy.x, joy.y) >= 0.78;
  const sprinting = (keys.has('shift') || sprintToggle || joystickSprint) && hasInput;

  const slopeInfo = terrainSlopeAt(p.x, p.z);
  // Calculate motion alignment with downhill slope fall-line
  const dotWithDownhill = dir.x * slopeInfo.normal.x + dir.z * slopeInfo.normal.z;

  if (hasInput) {
    if (dotWithDownhill > 0.15) {
      // Going DOWNHILL with gravity: fast, agile, satisfying sprint descent!
      slopeSpeedMultiplier = 1.0 + Math.min(0.35, slope * 0.45);
    } else if (dotWithDownhill < -0.15 && slope > 0.35) {
      // Going UPHILL against gravity: natural uphill climbing resistance
      slopeSpeedMultiplier = Math.max(0.42, 1 - (slope - 0.35) * 1.5);
    }
  }

  if (isWading) {
    slopeSpeedMultiplier *= 0.72; // Shallow water wading resistance
  }

  if (hasInput) {
    const desired = Math.atan2(dir.x, dir.z);
    const speed = player.swimming
      ? (sprinting ? 2.5 : 1.6)
      : (sprinting ? 7.8 : 4.5) * slopeSpeedMultiplier;
    const targetSpeed = speed * inputMagnitude;
    const response = 1 - Math.exp(-(player.swimming ? 6 : 14) * dt);
    player.velocity.x = lerp(player.velocity.x, Math.sin(desired) * targetSpeed, response);
    player.velocity.z = lerp(player.velocity.z, Math.cos(desired) * targetSpeed, response);
  } else {
    const response = 1 - Math.exp(-(player.swimming ? 3.8 : 11) * dt);
    player.velocity.x = lerp(player.velocity.x, 0, response);
    player.velocity.z = lerp(player.velocity.z, 0, response);
  }

  const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  const moving = hasInput || horizontalSpeed > (player.swimming ? 0.08 : 0.16);

  let angularVelocity = 0;
  if (horizontalSpeed > 0.05) {
    const desired = Math.atan2(player.velocity.x, player.velocity.z);
    const oldRy = player.root.rotation.y;
    player.root.rotation.y = angleLerp(player.root.rotation.y, desired, Math.min(1, dt * (player.swimming ? 5 : 9)));
    angularVelocity = (player.root.rotation.y - oldRy) / dt;
  }

  if (keys.has(' ') && !player.swimming && player.onGround) jump();

  // Water current physics: river flow pushes player downstream
  let currentVx = 0;
  let currentVz = 0;
  if (worldFields.flowSpeed > 0 && (worldFields.waterType === 'river' || worldFields.waterType === 'stream' || worldFields.waterType === 'lake')) {
    // When movement input is pressed, player authority counteracts current
    const currentImmersion = player.swimming
      ? (hasInput ? 0.30 : 0.72)
      : isWading
      ? clamp(wDepth / 0.65, 0.12, 0.38)
      : 0;
    if (currentImmersion > 0) {
      // Rivers can be powerful, but a swimmer must retain a meaningful chance
      // to cross them. Cap the physical drift while preserving downstream pull.
      const maxCurrent = player.swimming ? 2.35 : 1.25;
      const currentSpeed = Math.min(worldFields.flowSpeed * currentImmersion, maxCurrent);
      currentVx = worldFields.flowVector.x * currentSpeed;
      currentVz = worldFields.flowVector.y * currentSpeed;
    }
  }

  // Extreme slope sliding only on near-vertical cliff faces (> 57° / 1.02 rad)
  if (slope > 1.02 && player.onGround && !player.swimming) {
    const slideSpeed = Math.min(4.5, (slope - 1.0) * 8.0);
    currentVx += slopeInfo.normal.x * slideSpeed;
    currentVz += slopeInfo.normal.z * slideSpeed;
  }

  moveWithCollisions((player.velocity.x + currentVx) * dt, (player.velocity.z + currentVz) * dt);
  player.swimming = waterAt(p.x, p.z) && waterDepthAt(p.x, p.z) > 0.65;

  if (player.swimming) {
    const bedY = physicalGroundHeightAt(p.x, p.z);
    const surfaceY = waterSurfaceAt(p.x, p.z);
    const minY = bedY + 0.15;
    // Swimming follows the local river or lake surface.
    const jumpingOut = keys.has(' ');
    const aheadX = p.x + dir.x * 0.8;
    const aheadZ = p.z + dir.z * 0.8;
    const aheadSurface = waterSurfaceAt(aheadX, aheadZ);
    const bankAhead = !waterAt(aheadX, aheadZ) &&
      terrainHeightAt(aheadX, aheadZ) >= aheadSurface - 0.28;
    const targetY = keys.has('control')
      ? Math.max(minY, surfaceY - 2.0)
      : jumpingOut || bankAhead
      ? surfaceY + 0.35
      : surfaceY - 0.85;

    player.velocity.y = lerp(player.velocity.y, (targetY - p.y) * 5, Math.min(1, dt * 4.5));
    if (jumpingOut && bankAhead) {
      player.velocity.y = Math.max(player.velocity.y, 4.2);
    }
    p.y += player.velocity.y * dt;

    // Smooth transition from swimming to ground when climbing out onto shore
    if (p.y >= surfaceY - 0.25 && wDepth < 0.48) {
      player.swimming = false;
      player.onGround = true;
    }
  } else {
    // Variable gravity: strong fall, short jump on early release, soft apex
    const jumpHeld = keys.has(' ');
    if (player.velocity.y < 0) {
      player.velocity.y -= GRAVITY * FALL_MULTIPLIER * dt;
    } else if (player.velocity.y > 0 && !jumpHeld) {
      player.velocity.y -= GRAVITY * LOW_JUMP_MULTIPLIER * dt;
    } else {
      player.velocity.y -= GRAVITY * dt;
    }
    if (Math.abs(player.velocity.y) < 1.6) {
      player.velocity.y *= 0.88;
    }
    player.velocity.y = Math.max(player.velocity.y, MAX_FALL_SPEED);
    p.y += player.velocity.y * dt;

    let groundY = physicalGroundHeightAt(p.x, p.z);
    // Solid Home Structure Collision
    const home = chunks.loaded.get('0,0')?.getObjectByName('home') as THREE.Group | undefined;
    if (home) {
      const box = home.userData.collider;
      if (box && p.x > box.minX && p.x < box.maxX && p.z > box.minZ && p.z < box.maxZ) groundY = Math.max(groundY, home.position.y + 0.18);
    }

    // Solid Wooden Bridge Collision across river
    const pcx = chunks.coord(p.x), pcz = chunks.coord(p.z);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const cg = chunks.loaded.get(chunks.key(pcx + ox, pcz + oz));
        if (!cg) continue;
        const bridge = cg.getObjectByName('wooden-bridge') as THREE.Group | undefined;
        if (bridge && bridge.userData.collider) {
          const bbox = bridge.userData.collider;
          if (p.x >= bbox.minX && p.x <= bbox.maxX && p.z >= bbox.minZ && p.z <= bbox.maxZ) {
            groundY = Math.max(groundY, bbox.deckY);
          }
        }
      }
    }

    if (p.y <= groundY) {
      if (!player.onGround && player.velocity.y < -3.5) player.triggerLanding();
      p.y = groundY;
      player.velocity.y = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }
  }

  const cx = chunks.coord(p.x), cz = chunks.coord(p.z);
  if (cx !== lastCx || cz !== lastCz) {
    chunks.stream(p.x, p.z);
    lastCx = cx;
    lastCz = cz;
  }

  if (player.swimming !== wasSwimming) {
    hud.classList.toggle('swimming', player.swimming);
    touchControls.classList.toggle('swimming', player.swimming);
    waterSplash(p.x, p.z);
    say(player.swimming ? 'Swimming · hold Space / RISE to surface; Ctrl / DIVE to submerge.' : 'Back on land.');
  }

  fauna?.update(dt, p, sprinting);

  camYaw = angleLerp(camYaw, targetYaw, Math.min(1, dt * 12));
  camPitch = lerp(camPitch, targetPitch, Math.min(1, dt * 12));
  camDistance = lerp(camDistance, targetDistance, Math.min(1, dt * 12));
  player.root.visible = mode !== 'fpp';

  const focus = cameraFocus.copy(p);
  focus.y += player.swimming ? 0.28 : 1.05;

  if (mode === 'tpp') {
    cameraProbeTimer -= dt;
    if (cameraProbeTimer <= 0) {
      cameraProbeTimer = LOW_POWER_MODE ? 0.12 : 0.075;
      cameraBlockerObjects.length = 0;
      for (const o of chunks.cameraBlockers) cameraBlockerObjects.push(o);
      const pcx = chunks.coord(p.x), pcz = chunks.coord(p.z);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const terrain = chunks.loaded.get(chunks.key(pcx + ox, pcz + oz))?.getObjectByName('terrain');
          if (terrain) cameraBlockerObjects.push(terrain);
        }
      }
      cameraDirection.set(-Math.sin(camYaw) * Math.cos(camPitch), -Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch));
      cameraRay.near = 0;
      cameraRay.far = camDistance;
      cameraRay.set(focus, cameraDirection);
      cameraHits.length = 0;
      const hit = cameraRay.intersectObjects(cameraBlockerObjects, true, cameraHits)[0];
      cameraClearance = hit ? Math.max(1.35, hit.distance - 0.25) : camDistance;
    }
    const distance = Math.min(camDistance, cameraClearance);
    const h = Math.cos(camPitch) * distance;
    const pos = cameraPosition.copy(focus);
    pos.x -= Math.sin(camYaw) * h;
    pos.y -= Math.sin(camPitch) * distance;
    pos.z -= Math.cos(camYaw) * h;

    // Line-of-sight sweep across terrain to prevent clipping through slopes or ridges
    const sweepSteps = 5;
    for (let step = 1; step <= sweepSteps; step++) {
      const t = step / sweepSteps;
      const sx = focus.x + (pos.x - focus.x) * t;
      const sz = focus.z + (pos.z - focus.z) * t;
      const minTerrainY = terrainHeightAt(sx, sz) + 0.55;
      const sy = focus.y + (pos.y - focus.y) * t;
      if (sy < minTerrainY) {
        pos.x = focus.x + (pos.x - focus.x) * (t * 0.85);
        pos.y = Math.max(minTerrainY, focus.y + (pos.y - focus.y) * (t * 0.85));
        pos.z = focus.z + (pos.z - focus.z) * (t * 0.85);
        break;
      }
    }

    // Absolute ground floor clamp on target camera position
    const floorAtPos = terrainHeightAt(pos.x, pos.z) + 0.65;
    if (pos.y < floorAtPos) pos.y = floorAtPos;

    // Water surface clearance when not in deliberate underwater dive.
    if (!underwater && !keys.has('control') && waterAt(p.x, p.z)) {
      pos.y = Math.max(pos.y, waterSurfaceAt(p.x, p.z) + 0.45);
    }

    camera.position.lerp(pos, Math.min(1, dt * 14));

    // Hard safeguard: Camera position can NEVER break below terrain or expose underneath world
    const actualFloor = terrainHeightAt(camera.position.x, camera.position.z) + 0.55;
    if (camera.position.y < actualFloor) camera.position.y = actualFloor;

    const lookTarget = cameraLook.set(focus.x, focus.y + Math.sin(camPitch) * distance * 0.65, focus.z);
    camera.lookAt(lookTarget);
  } else {
    const eye = cameraEye.copy(p);
    eye.y += player.swimming ? 0.22 : 1.55;
    camera.position.lerp(eye, Math.min(1, dt * 18));
    const look = cameraLook.copy(eye);
    look.x += Math.sin(camYaw) * Math.cos(camPitch) * 8;
    look.y += Math.sin(camPitch) * 8;
    look.z += Math.cos(camYaw) * Math.cos(camPitch) * 8;
    camera.lookAt(look);
  }

  const localWaterSurface = waterAt(p.x, p.z) ? waterSurfaceAt(p.x, p.z) : WATER_LEVEL;
  const cameraUnderwater = player.swimming && camera.position.y < localWaterSurface - 0.04;
  if (cameraUnderwater !== underwater) {
    underwater = cameraUnderwater;
    hud.classList.toggle('underwater', underwater);
    if (scene.fog) {
      const fog = scene.fog as THREE.Fog;
      fog.color.copy(underwater ? underwaterFogColor : skyColor);
      fog.near = underwater ? 1.5 : 130;
      fog.far = underwater ? 22 : 950;
    }
  }

  // Choose directional animation from velocity relative to the character's facing,
  // not raw joystick direction. Assets without a matching clip safely use locomotion.
  const facingYaw = player.root.rotation.y;
  const localForwardSpeed = player.velocity.x * Math.sin(facingYaw) + player.velocity.z * Math.cos(facingYaw);
  const localSideSpeed = -player.velocity.x * Math.cos(facingYaw) + player.velocity.z * Math.sin(facingYaw);
  const movementIntent: 'forward' | 'backward' | 'strafe-left' | 'strafe-right' =
    Math.abs(localSideSpeed) > Math.abs(localForwardSpeed) * 1.15 && Math.abs(localSideSpeed) > 0.35
      ? (localSideSpeed < 0 ? 'strafe-left' : 'strafe-right')
      : localForwardSpeed < -0.35 ? 'backward' : 'forward';
  player.animate(walkTime += dt, moving, sprinting, player.swimming, dt, horizontalSpeed, angularVelocity, player.onGround, player.velocity.y, movementIntent);
  if (isPhotoMode) updatePhotoBadges();

  // Shooter simulation runs after the existing camera is positioned, so its hitscan uses the actual FPP view.
  survival.update(dt, keys.has('shoot'), keys.has('aim') || adsToggleOn);

  // Record breadcrumb displacement trail
  minimap.recordPosition(p.x, p.z);

  const aimed = getAimTarget();
  const canInteractWithAimed = !!aimed && !!(aimed.userData.resource || aimed.userData.interactable || aimed.userData.animal);
  document.body.classList.toggle('survival-can-interact', !!survival?.enabled && canInteractWithAimed);
  const combatTarget = getAimTarget(false, true);
  if (combatTarget?.userData.animal) {
    combatTarget.getWorldPosition(combatMarkerWorld);
    combatTargetMarker.position.set(combatMarkerWorld.x, combatMarkerWorld.y + 0.04, combatMarkerWorld.z);
    combatTargetMarker.visible = true;
    combatTargetMarker.rotation.z += dt * 2.4;
  } else {
    combatTargetMarker.visible = false;
  }
  if (aimed) {
    const r = aimed.userData.resource as { kind: string; hits: number; maxHits: number } | undefined;
    const animal = aimed.userData.animal as { species: keyof typeof SPECIES_NAME } | undefined;
    const interactable = aimed.userData.interactable as { action: string; label: string } | undefined;
    let label = 'Interact';
    if (animal) {
      const combatData = aimed.userData.animal as { hp?: number; maxHp?: number; species: keyof typeof SPECIES_NAME };
      label = `Pet ${SPECIES_NAME[animal.species]} · HP ${combatData.hp ?? '?'}${inventory.Fruit ? ' · Feed Fruit' : ''}`;
    }
    else if (r) label = `Harvest ${r.kind.replace('_', ' ')} (${r.maxHits - r.hits}/${r.maxHits})`;
    else if (interactable) label = interactable.label;
    else label = aimed.name.replace('front-door', 'Front Door').replace('tree-', 'Tree ');

    prompt.innerHTML = `<span class="promptKey">E</span> <span class="promptAction">${label}</span>`;
    prompt.classList.add('show');
  } else if (promptTimer <= 0) {
    prompt.classList.remove('show');
  }

  if (promptTimer > 0) {
    promptTimer -= dt;
    if (promptTimer <= 0) prompt.classList.remove('show');
  }

  const deg = ((-camYaw * 180) / Math.PI + 360) % 360;
  const cardinal = deg >= 337.5 || deg < 22.5 ? 'N' : deg < 67.5 ? 'NE' : deg < 112.5 ? 'E' : deg < 157.5 ? 'SE' : deg < 202.5 ? 'S' : deg < 247.5 ? 'SW' : deg < 292.5 ? 'W' : 'NW';
  compass.textContent = `${Math.round(deg)}° ${cardinal}`;

  // Update Mini-Map & Full Map
  mapAccumulator += dt;
  if (mapAccumulator >= 0.08) {
    mapAccumulator = 0;
    const markers = fauna?.markers() ?? [];
    const survivalRadar = survival.enabled ? survival.getRadarState() : undefined;
    minimap.renderMini(p, camYaw, markers, survivalRadar);
    if (minimap.isOpen()) minimap.renderFull(p, camYaw, markers, survivalRadar);

    // Distance to Home & Village on HUD
    const dHome = Math.round(Math.hypot(p.x - HOME_X, p.z - HOME_Z));
    minimapHomeDist.textContent = `⌂ ${dHome}m`;

    const wp = minimap.getWaypoint();
    if (wp) {
      const dWp = Math.round(Math.hypot(p.x - wp.x, p.z - wp.z));
      waypointBadge.style.display = 'block';
      waypointBadge.textContent = `★ ${wp.label} · ${dWp}m`;
    } else {
      waypointBadge.style.display = 'none';
    }
  }

  autosave += dt;
  if (autosave > 2) {
    autosave = 0;
    saveNow();
  }

  uiAccumulator += dt;
  if (uiAccumulator >= 0.1) {
    uiAccumulator = 0;
    // In TPP mode, hide center reticle for cinematic BR perspective; in FPP mode, show clean dot
    target.style.display = mode === 'tpp' ? 'none' : 'grid';
    target.classList.toggle('active', !!aimed);
    target.textContent = aimed ? '✦' : '•';
    (document.querySelector('#modeBtn') as HTMLButtonElement).textContent = mode.toUpperCase();
    (document.querySelector('#runBtn') as HTMLButtonElement).textContent = sprintToggle ? 'RUN' : 'WALK';
    (document.querySelector('#jumpBtn') as HTMLButtonElement).textContent = player.swimming ? 'RISE' : 'JUMP';

    const hour = Math.floor(worldTime);
    const minute = Math.floor((worldTime - hour) * 60);
    const biome = biomeAt(p.x, p.z);
    status.textContent = `${player.swimming ? 'SWIM' : mode.toUpperCase()} · ${sprinting ? 'RUN' : 'WALK'} · ${biome.toUpperCase()} · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    (document.querySelector('#wildlife') as HTMLElement).textContent = fauna?.status(p) ?? 'Wildlife loading…';
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  survey.resize(innerWidth / innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, LOW_POWER_MODE ? 1.25 : 1.65));
  renderer.setSize(innerWidth, innerHeight);
});

addEventListener('beforeunload', saveNow);

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (survey.isActive) {
    // Only redraw the frozen survey scene when its camera actually changes.
    // This keeps the full-world survey detailed without continuously burning GPU.
    if (survey.update(dt)) renderer.render(scene, survey.camera);
    return;
  }
  update(dt);
  renderer.render(scene, camera);
}
loop();
