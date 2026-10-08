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
import { WeatherSystem } from './weather';
import { buildHome, buildVillage, buildBridge, HOME_UPGRADE_COSTS } from './settlement';
import { WildlifeSystem, isSharedAnimalAsset, speciesColor, SPECIES_NAME, SPECIES_ICON } from './fauna';
import { MinimapSystem } from './minimap';
import { settings } from './settings';
import { WorldSurvey, type SurveyView } from './survey';

type Save = {
  version: 2;
  player: { x: number; y: number; z: number; ry: number; mode: Mode };
  camera: { yaw: number; pitch: number; distance: number };
  changes: Record<string, string[]>;
  inventory: Record<string, number>;
  wildlifeTrust?: Record<string, number>;
  worldTime?: number;
  homeLevel?: HomeLevel;
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
    // Grand ancient oak tree (2.5x larger, majestic presence)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, 3.2, lod === 0 ? 10 : 6), trunkMat);
    trunk.position.y = 1.6;
    g.add(trunk);
    // Root buttresses
    for (let r = 0; r < 4; r++) {
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 1.2, 5), trunkMat);
      const ra = r * (Math.PI / 2);
      root.position.set(Math.cos(ra) * 0.45, 0.4, Math.sin(ra) * 0.45);
      root.rotation.z = 0.35;
      root.rotation.y = ra;
      g.add(root);
    }
    // Main multi-layered canopy
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
    // Standard Oak / Fruit tree
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
  rock.rotation.y = hash(kind === 'boulder' ? 1 : 0, Math.round(base * 1000)) * Math.PI * 2;
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
const waterMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  transparent: true,
  opacity: 0.92,
  roughness: 0.14,
  metalness: 0.08,
  depthWrite: true,
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

waterMaterial.onBeforeCompile = shader => {
  shader.uniforms.uTime = { value: 0 };
  shader.uniforms.uWaveHeight = { value: 0.04 };
  shader.uniforms.uWindDir = { value: new THREE.Vector2(0.7071, -0.7071) };
  shader.vertexShader = `
    uniform float uTime;
    uniform float uWaveHeight;
    uniform vec2 uWindDir;
  ` + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    vec4 ripplePos = modelMatrix * vec4(transformed, 1.0);
    // Shoreline damping: foam/shoreline vertices (whiter color) stay anchored to the beach and do not lift off the sand
    float shoreDamping = clamp(color.b * 1.6 - color.r * 0.6, 0.0, 1.0);
    float windDot = dot(ripplePos.xz, uWindDir);
    float wave1 = sin(windDot * 0.55 + uTime * 2.2) * uWaveHeight;
    float wave2 = cos(ripplePos.x * 0.75 + ripplePos.z * 0.35 - uTime * 1.3) * (uWaveHeight * 0.45);
    float wave = (wave1 + wave2) * shoreDamping;
    transformed.y += wave;`
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

    // Riverbed & shoreline alluvial sediment displacement
    float isRiverbed = clamp((1.8 - wy) / 1.5, 0.0, 1.0);
    float riverDisp = (sin(wx * 0.65 + wz * 0.55) * 0.07) * isRiverbed;
    // Do not perturb an authoritative wet bed back through its water surface.
    riverDisp *= 1.0 - smoothstep(0.0, 0.42, aWaterMask);

    transformed.y += (mtnDisp + riverDisp) * uDispScale;
    `
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

// --- GEOGRAPHICAL HIGH-MOUNTAIN CLOUD & MIST DECK ---
// Clouds intersect mountain ranges, letting high summits soar above the cloud deck
const cloudDeckGroup = new THREE.Group();
cloudDeckGroup.name = 'mountain-cloud-deck';
const cloudDeckMat = new THREE.MeshBasicMaterial({
  color: 0xe8f0f5,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const cloudDeckGeo = new THREE.PlaneGeometry(850, 850, 16, 16);
const cloudDeckMesh = new THREE.Mesh(cloudDeckGeo, cloudDeckMat);
cloudDeckMesh.rotation.x = -Math.PI / 2;
cloudDeckMesh.position.set(0, 105.0, 0);
cloudDeckGroup.add(cloudDeckMesh);
scene.add(cloudDeckGroup);

const world = new THREE.Group(), actors = new THREE.Group();
scene.add(world, actors);

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

let fauna: WildlifeSystem | null = null;

function disposeWorldObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!isSharedAnimalAsset(o.geometry) && !geometries.has(o.geometry)) {
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

    const lodSetting = settings.current.lodDetail || 'ultra';
    const segs =
      lod === 0
        ? (lodSetting === 'ultra' ? 24 : lodSetting === 'balanced' ? 16 : 12)
        : lod === 1
        ? (lodSetting === 'ultra' ? 12 : 8)
        : 4;
    const terrain = new THREE.PlaneGeometry(SIZE, SIZE, segs, segs);
    terrain.rotateX(-Math.PI / 2);
    const pos = terrain.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const chunkBiome = biomeAt(cx * SIZE + SIZE / 2, cz * SIZE + SIZE / 2);

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i) + cx * SIZE + SIZE / 2;
      const lz = pos.getZ(i) + cz * SIZE + SIZE / 2;
      const h = terrainHeightAt(lx, lz);
      pos.setY(i, h);
      const c = terrainColorAt(h, lx, lz, chunkBiome);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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

    const waterGrid = lod === 0
      ? (LOW_POWER_MODE ? 16 : 32)
      : lod === 1
      ? 16
      : 8;
    const step = SIZE / waterGrid;
    const waterPositions: number[] = [], waterColors: number[] = [], waterIndices: number[] = [];

    const deepNavy = new THREE.Color(0x0e2b47);
    const emeraldMid = new THREE.Color(0x23757a);
    const turquoiseShallow = new THREE.Color(0x56b8ad);
    const shorelineFoam = new THREE.Color(0xf4f9fa);

    // Build grid vertices for wet cells and shoreline boundary
    const vertIndex = new Int32Array((waterGrid + 1) * (waterGrid + 1)).fill(-1);
    let nextIdx = 0;

    for (let iz = 0; iz <= waterGrid; iz++) {
      for (let ix = 0; ix <= waterGrid; ix++) {
        const wx = cx * SIZE + ix * step;
        const wz = cz * SIZE + iz * step;
        if (nearHome(wx, wz)) continue;

        const depth = waterDepthAt(wx, wz);
        let isWetOrShore = depth > 0.005;
        if (!isWetOrShore) {
          if (
            (!nearHome(wx + step, wz) && waterDepthAt(wx + step, wz) > 0.01) ||
            (!nearHome(wx - step, wz) && waterDepthAt(wx - step, wz) > 0.01) ||
            (!nearHome(wx, wz + step) && waterDepthAt(wx, wz + step) > 0.01) ||
            (!nearHome(wx, wz - step) && waterDepthAt(wx, wz - step) > 0.01)
          ) {
            isWetOrShore = true;
          }
        }

        if (isWetOrShore) {
          vertIndex[iz * (waterGrid + 1) + ix] = nextIdx++;
          // At shoreline vertices, use a nearby wet surface height instead of
          // the global sea level. This prevents sloping water sheets from rising
          // over a high-elevation riverbank.
          let surfaceY = waterSurfaceAt(wx, wz);
          if (depth <= 0.005) {
            const neighbourSurfaces: number[] = [];
            for (const [ox, oz] of [[step, 0], [-step, 0], [0, step], [0, -step]] as [number, number][]) {
              const nx = wx + ox;
              const nz = wz + oz;
              if (waterDepthAt(nx, nz) > 0.01) neighbourSurfaces.push(waterSurfaceAt(nx, nz));
            }
            if (neighbourSurfaces.length) {
              surfaceY = neighbourSurfaces.reduce((sum, value) => sum + value, 0) / neighbourSurfaces.length;
            }
          }
          waterPositions.push(ix * step, surfaceY, iz * step);

          const c = new THREE.Color();
          if (depth <= 0.05) {
            // Shoreline contact line: white foam
            c.copy(shorelineFoam);
          } else if (depth < 0.45) {
            // Shallow crystal turquoise
            c.copy(shorelineFoam).lerp(turquoiseShallow, depth / 0.45);
          } else if (depth < 1.1) {
            // Mid depth emerald
            c.copy(turquoiseShallow).lerp(emeraldMid, (depth - 0.45) / 0.65);
          } else {
            // Deep volumetric navy
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

        const hasWaterInCell =
          waterDepthAt(wxMid, wzMid) > 0.005 || (i00 >= 0 && i10 >= 0 && i11 >= 0 && i01 >= 0);

        if (hasWaterInCell) {
          if (i00 >= 0 && i01 >= 0 && i11 >= 0) waterIndices.push(i00, i01, i11);
          if (i00 >= 0 && i11 >= 0 && i10 >= 0) waterIndices.push(i00, i11, i10);
        }
      }
    }

    if (waterIndices.length) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(waterColors, 3));
      geom.setIndex(waterIndices);
      geom.computeVertexNormals();
      const waterMesh = new THREE.Mesh(geom, waterMaterial);
      waterMesh.name = 'water-surface';
      waterGroup.add(waterMesh);
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

  surveyAll(active: boolean) {
    if (active) {
      const oldRadius = settings.current.chunkRadius;
      // The survey is deliberately expensive: it asks the normal chunk renderer
      // to materialize the complete finite world at gameplay-quality LOD0.
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
        }
      }
      return;
    }
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
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

// --- INPUTS & CONTROLS ---
const keys = new Set<string>();
const keyboardKeys = new Set<string>();
const pointerKeys = new Map<string, Set<number>>();

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
  keyboardKeys.add(key);
  syncKeyState(key);
  if (key === ' ' || key.startsWith('arrow')) e.preventDefault();
  if (key === 'f') mode = 'fpp';
  if (key === 'c') mode = 'tpp';
  if (!e.repeat && key === 'e') interact();
  if (!e.repeat && key === 'b') toggleEmoteBar();
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

  const sensX = settings.current.sensitivityX;
  const sensY = settings.current.sensitivityY;
  const invertY = settings.current.invertY ? -1 : 1;

  targetYaw -= dx * 0.008 * sensX;
  targetPitch = clamp(targetPitch - dy * 0.006 * sensY * invertY, -1.2, 0.95);
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
  lastX = e.clientX;
  lastY = e.clientY;
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

// Virtual Joystick for Mobile
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
  const m = 44;
  if (l > m) {
    x = (x / l) * m;
    y = (y / l) * m;
  }
  joy = { x: x / m, y: y / m };
  knob.style.transform = `translate(${x}px,${y}px)`;
};

stick.addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopPropagation();
  if (joyPointer !== null) return;
  joyPointer = e.pointerId;
  joyActive = true;
  stick.setPointerCapture(e.pointerId);
  moveJoy(e);
});
stick.addEventListener('pointermove', moveJoy);
const endJoy = (e: PointerEvent) => {
  if (joyPointer !== e.pointerId) return;
  e.preventDefault();
  e.stopPropagation();
  joyPointer = null;
  joyActive = false;
  joy = { x: 0, y: 0 };
  knob.style.transform = 'translate(0,0)';
};
stick.addEventListener('pointerup', endJoy);
stick.addEventListener('pointercancel', endJoy);
stick.addEventListener('lostpointercapture', endJoy);

// Mobile Look Zone (Right screen drag)
const lookZone = document.querySelector('#lookZone') as HTMLElement;
let lookPointer: number | null = null;
lookZone.addEventListener('pointerdown', e => {
  if (lookPointer !== null) return;
  e.preventDefault();
  e.stopPropagation();
  lookPointer = e.pointerId;
  lastX = e.clientX;
  lastY = e.clientY;
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

// Touch buttons
bindAction(document.querySelector('#modeBtn') as HTMLButtonElement, () => (mode = mode === 'tpp' ? 'fpp' : 'tpp'));
bindHoldAction(document.querySelector('#jumpBtn') as HTMLButtonElement, ' ', jump);
bindHoldAction(document.querySelector('#diveBtn') as HTMLButtonElement, 'control');
bindAction(document.querySelector('#runBtn') as HTMLButtonElement, () => (sprintToggle = !sprintToggle));
bindAction(document.querySelector('#interactBtn') as HTMLButtonElement, interact);

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
const surveyBtn = document.querySelector('#surveyBtn') as HTMLButtonElement | null;
const surveyOverlay = document.querySelector('#surveyOverlay') as HTMLDivElement | null;
const surveyCloseBtn = document.querySelector('#surveyCloseBtn') as HTMLButtonElement | null;
const surveyTerrainBtn = document.querySelector('#surveyTerrainBtn') as HTMLButtonElement | null;
const surveyHydrologyBtn = document.querySelector('#surveyHydrologyBtn') as HTMLButtonElement | null;
const surveyCaptureBtn = document.querySelector('#surveyCaptureBtn') as HTMLButtonElement | null;
const surveyCaptureSize = document.querySelector('#surveyCaptureSize') as HTMLSelectElement | null;
const surveyStatus = document.querySelector('#surveyStatus') as HTMLSpanElement | null;
const minimapHomeDist = document.querySelector('#minimapHomeDist') as HTMLSpanElement;

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
    sensXVal.textContent = `${settings.current.sensitivityX.toFixed(1)}x`;
    sensYVal.textContent = `${settings.current.sensitivityY.toFixed(1)}x`;
    invertYCheck.checked = settings.current.invertY;
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
  sensXVal.textContent = `${v.toFixed(1)}x`;
});
sensYSlider.addEventListener('input', () => {
  const v = parseFloat(sensYSlider.value);
  settings.update({ sensitivityY: v });
  sensYVal.textContent = `${v.toFixed(1)}x`;
});
invertYCheck.addEventListener('change', () => {
  settings.update({ invertY: invertYCheck.checked });
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
function setSurveyMode(active: boolean) {
  if (active) {
    isPhotoMode = false;
    document.body.classList.remove('photo-mode-active', 'photo-clean-mode');
    survey.setActive(true);
    chunks.surveyAll(true);
    world.visible = true;
    actors.visible = true;
    celestialGroup.visible = true;
    distantHorizonMesh.visible = true;
    cloudDeckGroup.visible = true;
    splashRing.visible = false;
    surveyWasFog = scene.fog;
    scene.fog = null;
    scene.background = new THREE.Color(0x090d12);
    document.body.classList.add('survey-active');
    updateSurveyUI();
    say('World Survey · drag to pan · wheel/pinch to zoom · tap a place to focus');
  } else {
    survey.setActive(false);
    chunks.surveyAll(false);
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
  if (survey.isActive) world.visible = view !== 'world';
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
const surveyWorldBtn = document.querySelector('#surveyWorldBtn') as HTMLButtonElement | null;
if (surveyWorldBtn) bindAction(surveyWorldBtn, () => setSurveyView('world'));
if (surveyTerrainBtn) bindAction(surveyTerrainBtn, () => setSurveyView('terrain'));
if (surveyHydrologyBtn) bindAction(surveyHydrologyBtn, () => setSurveyView('hydrology'));
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

function hitResource(obj: THREE.Object3D) {
  const res = obj.userData.resource as { kind: ResourceKind; hits: number; maxHits: number };
  const def = RESOURCE_DEFS[res.kind];
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

function getAimTarget(force = false): THREE.Object3D | null {
  if (!force && aimTimer > 0) return aimCache;
  aimTimer = LOW_POWER_MODE ? 0.10 : 0.05;

  const pp = player.root.position;

  if (mode === 'tpp') {
    // Call of Duty Battle Royale style character-centric action volume
    // Focuses on nearby objects within character interaction reach (~3.2m)
    let bestObj: THREE.Object3D | null = null;
    let bestScore = -Infinity;

    // Player forward facing vector
    const charYaw = player.root.rotation.y;
    const forwardX = Math.sin(charYaw);
    const forwardZ = Math.cos(charYaw);

    for (const o of chunks.aimTargets) {
      if (!o.visible || !o.parent) continue;
      const ox = o.matrixWorld.elements[12];
      const oy = o.matrixWorld.elements[13];
      const oz = o.matrixWorld.elements[14];

      const dx = ox - pp.x;
      const dy = oy - pp.y;
      const dz = oz - pp.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 3.4 || Math.abs(dy) > 2.8) continue;

      // Facing alignment (-1 to 1)
      const dot = dist > 0.05 ? (dx * forwardX + dz * forwardZ) / dist : 1.0;

      // In TPP: allow anything immediately adjacent (<1.3m), or in forward cone (dot >= 0.28, ~73 deg)
      if (dist > 1.3 && dot < 0.28) continue;

      // Score prefers closer objects with high directional alignment
      const score = (1.0 - dist / 3.4) * 2.0 + dot * 1.5;
      if (score > bestScore) {
        bestScore = score;
        bestObj = o;
      }
    }

    if (bestObj) {
      let o = bestObj;
      while (o.parent && o.parent !== world && !o.userData.resource && !o.userData.interactable && !o.userData.animal) o = o.parent;
      return (aimCache = o);
    }
    return (aimCache = null);
  }

  // FPP mode: Precision raycast from camera eye
  aimRay.setFromCamera(aimNdc.set(0, 0), camera);
  aimObjects.length = 0;
  for (const o of chunks.aimTargets) aimObjects.push(o);
  aimHits.length = 0;
  const hit = aimRay.intersectObjects(aimObjects, true, aimHits)[0];
  if (!hit || hit.distance > 3.8) return (aimCache = null);
  let o = hit.object;
  while (o.parent && o.parent !== world && !o.userData.resource && !o.userData.interactable && !o.userData.animal) o = o.parent;
  return (aimCache = o);
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
    survey.update(dt);
    return;
  }
  aimTimer = Math.max(0, aimTimer - dt);

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

  // High-mountain cloud deck altitude & gentle atmospheric drift
  cloudDeckMesh.position.y = weatherEffects.cloudBaseAltitude;
  cloudDeckMesh.position.x = player.root.position.x;
  cloudDeckMesh.position.z = player.root.position.z;
  cloudDeckMat.opacity = clamp(0.22 + weatherEffects.skyDim * 0.42, 0.18, 0.65);
  cloudDeckMesh.rotation.z += dt * 0.005;

  const wasSwimming = player.swimming;
  const p = player.root.position;
  const worldFields = queryWorldFields(p.x, p.z);
  const wDepth = worldFields.waterDepth;
  player.swimming = wDepth > 0.65;
  const isWading = wDepth > 0.05 && !player.swimming;

  // Slope resistance & downhill agility
  const slope = worldFields.slope;
  let slopeSpeedMultiplier = 1.0;

  const iv = input();
  const forward = moveForward.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  const right = moveRight.set(-Math.cos(camYaw), 0, Math.sin(camYaw));
  const dir = moveDirection.set(0, 0, 0).addScaledVector(right, iv.x).addScaledVector(forward, -iv.y);
  const inputMagnitude = Math.min(1, dir.length());
  const hasInput = inputMagnitude > 0.08;
  const sprinting = (keys.has('shift') || sprintToggle) && hasInput;

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
    const bedY = terrainHeightAt(p.x, p.z);
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

    let groundY = terrainHeightAt(p.x, p.z);
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

  player.animate(walkTime += dt, moving, sprinting, player.swimming, dt, horizontalSpeed, angularVelocity, player.onGround, player.velocity.y);
  if (isPhotoMode) updatePhotoBadges();

  // Record breadcrumb displacement trail
  minimap.recordPosition(p.x, p.z);

  const aimed = getAimTarget();
  if (aimed) {
    const r = aimed.userData.resource as { kind: string; hits: number; maxHits: number } | undefined;
    const animal = aimed.userData.animal as { species: keyof typeof SPECIES_NAME } | undefined;
    const interactable = aimed.userData.interactable as { action: string; label: string } | undefined;
    let label = 'Interact';
    if (animal) label = `Pet ${SPECIES_NAME[animal.species]}${inventory.Fruit ? ' (Feed Fruit)' : ''}`;
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
    minimap.renderMini(p, camYaw, markers);
    if (minimap.isOpen()) minimap.renderFull(p, camYaw, markers);

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
  update(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, survey.isActive ? survey.camera : camera);
}
loop();
