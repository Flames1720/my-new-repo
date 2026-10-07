import * as THREE from 'three';
import type { Biome } from './types';

export const SEED = 847231;
export const SIZE = 16;
export const WORLD_RADIUS = 18;
export const WORLD_DIAMETER = WORLD_RADIUS * 2 + 1;
export const WATER_LEVEL = 1.25;
export const ROAD_SPACING = 128;
export const ROAD_WIDTH = 5.5;

export const HOME_X = 8;
export const HOME_Z = 8;
export const HOME_FLATTEN_RADIUS = 7.5;
export const HOME_CLEAR_MARGIN = 3.0;

// Village / Hamlet location
export const VILLAGE_X = 52;
export const VILLAGE_Z = -36;
export const VILLAGE_RADIUS = 16;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const hash = (x: number, z: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(SEED, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

// --- River Spline & Meander ---
export function riverDistanceAt(x: number, z: number): number {
  const expectedZ = Math.sin(x * 0.022 + 1.2) * 26 + Math.cos(x * 0.009) * 14 + x * 0.52 - 38;
  const dz = z - expectedZ;
  const streamZ = -60 + Math.sin(x * 0.04) * 12 + Math.abs(x - 20) * 0.4;
  const dzStream = z - streamZ;
  const isNorthernStream = x > -30 && x < 70 && z < -20 && z > -80;

  const mainDist = Math.abs(dz) * 0.85;
  if (isNorthernStream) {
    const streamDist = Math.abs(dzStream) * 1.1;
    return Math.min(mainDist, streamDist);
  }
  return mainDist;
}

export function isRiverAt(x: number, z: number, width = 7.5): boolean {
  if (nearHome(x, z)) return false;
  return riverDistanceAt(x, z) < width / 2;
}

// Mountain ridge mask & noise
export const mountainMaskAt = (x: number, z: number) => {
  const n =
    Math.sin(x * 0.0032 + SEED * 0.00011) * Math.cos(z * 0.0038 - SEED * 0.00009) +
    Math.sin((x + z) * 0.0024 + SEED * 0.00005) * 0.65;
  return clamp((n - 0.16) / 0.58, 0, 1);
};

export const mountainNoiseAt = (x: number, z: number) => {
  const sharpCrags = Math.abs(Math.sin(x * 0.042 + z * 0.028 + SEED * 0.0002) * 2.8);
  const ridges = Math.cos(x * 0.031 - z * 0.042 - SEED * 0.00015) * 2.6;
  const fine = Math.sin((x - z) * 0.075) * 1.4;
  const serrated = Math.abs(Math.cos(x * 0.065 + z * 0.055) * 1.2);
  return sharpCrags + ridges + fine + serrated;
};

// Soaring High Mountains reaching 48m - 64m with dramatic alpine summits and snowlines
export const rawTerrainHeightAt = (x: number, z: number) => {
  const broad = Math.sin(x * 0.015 + SEED * 0.001) * 2.4 + Math.cos(z * 0.018 - SEED * 0.0007) * 1.9;
  const hills = Math.sin((x + z) * 0.038) * 1.1 + Math.cos((x - z) * 0.028) * 0.85;
  const mask = mountainMaskAt(x, z);

  // Towering high alpine mountains with steep rock ridges, sharp cirques and snowy crests
  const mountain = mask * mask * (mountainNoiseAt(x, z) * 8.5 + Math.pow(mask, 1.4) * 36.0);
  return Math.max(0, broad + hills + 1.2 + mountain);
};

export const HOME_BASE_HEIGHT = rawTerrainHeightAt(HOME_X, HOME_Z);
export const VILLAGE_BASE_HEIGHT = rawTerrainHeightAt(VILLAGE_X, VILLAGE_Z);

export const nearHome = (x: number, z: number) =>
  x > HOME_X - 5.5 - HOME_CLEAR_MARGIN &&
  x < HOME_X + 5.5 + HOME_CLEAR_MARGIN &&
  z > HOME_Z - 4.5 - HOME_CLEAR_MARGIN &&
  z < HOME_Z + 4.5 + HOME_CLEAR_MARGIN;

export const nearVillage = (x: number, z: number) => Math.hypot(x - VILLAGE_X, z - VILLAGE_Z) < VILLAGE_RADIUS;

export const roadAt = (x: number, z: number) => {
  const mx = Math.abs((((x + ROAD_SPACING / 2) % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING - ROAD_SPACING / 2);
  const mz = Math.abs((((z + ROAD_SPACING / 2) % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING - ROAD_SPACING / 2);
  const toVillageDist = distToSegment(x, z, HOME_X, HOME_Z, VILLAGE_X, VILLAGE_Z);
  return mx < ROAD_WIDTH / 2 || mz < ROAD_WIDTH / 2 || toVillageDist < 2.4;
};

function distToSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
  const l2 = (x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1);
  if (l2 === 0) return Math.hypot(px - x1, pz - z1);
  let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), pz - (z1 + t * (z2 - z1)));
}

export const isBridgeAt = (x: number, z: number): boolean => {
  return roadAt(x, z) && isRiverAt(x, z, 10);
};

// Natural smooth lake signal
export const lakeSignalAt = (x: number, z: number) =>
  Math.sin(x * 0.011 + z * 0.017 + SEED * 0.00003) + Math.cos(x * 0.019 - z * 0.009 - SEED * 0.00002);

// Smooth, natural parabolic lake basin
export const lakeDepressionAt = (x: number, z: number) => {
  if (nearHome(x, z)) return 0;
  const edge = clamp((lakeSignalAt(x, z) - 1.25) / 0.44, 0, 1);
  const smooth = edge * edge * (3 - 2 * edge);
  const lowland = clamp((WATER_LEVEL + 1.4 - rawTerrainHeightAt(x, z)) / 1.3, 0, 1);
  return smooth * lowland;
};

// Smooth river valley carve
export const riverCarveAt = (x: number, z: number) => {
  if (nearHome(x, z)) return 0;
  const rDist = riverDistanceAt(x, z);
  const riverHalfWidth = 6.8;
  if (rDist > riverHalfWidth) return 0;
  const t = 1 - rDist / riverHalfWidth;
  const smooth = t * t * (3 - 2 * t);
  return smooth * 2.2;
};

// Continuous terrain height with realistic slope into water
export const terrainHeightAt = (x: number, z: number) => {
  const raw = rawTerrainHeightAt(x, z);

  const dHome = Math.hypot(x - HOME_X, z - HOME_Z);
  let ground = raw;
  if (dHome < HOME_FLATTEN_RADIUS) {
    const t = 1 - dHome / HOME_FLATTEN_RADIUS;
    ground = raw + (HOME_BASE_HEIGHT - raw) * (t * t * (3 - 2 * t));
  }

  const dVillage = Math.hypot(x - VILLAGE_X, z - VILLAGE_Z);
  if (dVillage < VILLAGE_RADIUS) {
    const t = 1 - dVillage / VILLAGE_RADIUS;
    ground = ground + (VILLAGE_BASE_HEIGHT - ground) * (t * t * (3 - 2 * t) * 0.7);
  }

  const lakeDepth = lakeDepressionAt(x, z) * 2.1;
  const riverDepth = riverCarveAt(x, z);
  return ground - lakeDepth - riverDepth;
};

export const waterDepthAt = (x: number, z: number) => {
  const th = terrainHeightAt(x, z);
  return Math.max(0, WATER_LEVEL - th);
};

export const waterAt = (x: number, z: number) => {
  if (nearHome(x, z)) return false;
  return waterDepthAt(x, z) > 0.02;
};

export function biomeAt(x: number, z: number): Biome {
  const h = terrainHeightAt(x, z);
  const nearWater =
    waterAt(x, z) ||
    waterAt(x + 3.5, z) ||
    waterAt(x - 3.5, z) ||
    waterAt(x, z + 3.5) ||
    waterAt(x, z - 3.5);

  if (nearWater) {
    if (riverDistanceAt(x, z) < 10) return 'riverbank';
    return h < 1.8 ? 'wetland' : 'shore';
  }
  if (h > 18.0) return 'alpine';
  const canopy = Math.sin(x * 0.013 + SEED * 0.0001) + Math.cos(z * 0.012 - SEED * 0.0002) + Math.sin((x - z) * 0.007);
  return canopy > 0.32 ? 'forest' : 'meadow';
}

// --- SOIL, ROCK, STRATA & MOUNTAIN COLOR PALETTE ---
export const grassColor = new THREE.Color(0x6b9655);
export const darkSoilColor = new THREE.Color(0x382618); // Rich dark humus topsoil
export const richLoamSoil = new THREE.Color(0x4a3424); // Loamy fertile soil layer
export const subsoilClay = new THREE.Color(0x7c492e); // Reddish-brown clay strata layer
export const deepSandstone = new THREE.Color(0x8f6a4a); // Sedimentary sandstone strata
export const shaleBedrock = new THREE.Color(0x2d3035); // Dark slate/shale bedrock
export const mountainGranite = new THREE.Color(0x727376); // High mountain granite
export const cliffDarkRock = new THREE.Color(0x3f3e3c);
export const alpineSnow = new THREE.Color(0xf7f9fc);
export const forestTintColor = new THREE.Color(0x40623b);
export const meadowTintColor = new THREE.Color(0x8ea862);
export const wetlandTintColor = new THREE.Color(0x848352);

export const dryBeachSand = new THREE.Color(0xd6c290);
export const wetShorelineSand = new THREE.Color(0x8e784f);
export const submergedPebbles = new THREE.Color(0x484439);
export const riverbankSand = new THREE.Color(0xb5a77b);

// Compute soil strata layer and color for cutaways, riverbeds and mountains
export function terrainColorAt(h: number, x: number, z: number, biome: Biome): THREE.Color {
  let c: THREE.Color;

  const waterDist = h - WATER_LEVEL;

  // 1. Shoreline & Riverbed sand / pebbles / submerged silt
  if (waterDist < -0.15) {
    const pebbleNoise = Math.sin(x * 0.8 + z * 0.9) * 0.5 + 0.5;
    c = submergedPebbles.clone().lerp(richLoamSoil, pebbleNoise * 0.25);
  } else if (waterDist < 0.08) {
    c = wetShorelineSand.clone();
  } else if (waterDist < 0.45) {
    const t = (waterDist - 0.08) / 0.37;
    c = wetShorelineSand.clone().lerp(dryBeachSand, t);
  } else if (waterDist < 1.0) {
    const t = (waterDist - 0.45) / 0.55;
    // Soil layer exposed under grass roots near shore and riverbeds
    c = dryBeachSand.clone().lerp(darkSoilColor, t * 0.65).lerp(grassColor, t);
  } else if (h < 5.8) {
    // Lush meadow / forest floor with dark soil humus accents
    const soilNoise = Math.sin(x * 0.35 + z * 0.28) * 0.5 + 0.5;
    c = grassColor.clone().lerp(darkSoilColor, soilNoise * 0.22);
  } else if (h < 11.5) {
    // Foothills transitioning through subsoil clay strata and stone
    const t = (h - 5.8) / 5.7;
    const strataBand = Math.sin(h * 2.2 + x * 0.05) * 0.5 + 0.5;
    c = grassColor.clone().lerp(subsoilClay, t * 0.65).lerp(deepSandstone, strataBand * 0.4).lerp(mountainGranite, t);
  } else if (h < 22.0) {
    // Sub-alpine rocky cliffs with visible geological sedimentary strata banding
    const strataBand = Math.sin(h * 1.6 + Math.sin(x * 0.08 + z * 0.04) * 2.0) * 0.5 + 0.5;
    const t = (h - 11.5) / 10.5;
    c = mountainGranite.clone().lerp(cliffDarkRock, t);
    // Sedimentary strata alternating between subsoil clay, dark shale, and granite
    c.lerp(shaleBedrock, strataBand * 0.42);
    if (strataBand > 0.7) c.lerp(subsoilClay, 0.28);
  } else if (h < 34.0) {
    // High mountain peaks: dark granite transitioning into snow line
    const t = (h - 22.0) / 12.0;
    c = cliffDarkRock.clone().lerp(alpineSnow, t);
  } else {
    // Towering alpine summits covered in eternal glacier snow and ice
    const peakGleam = Math.sin(x * 0.1 + z * 0.1) * 0.05;
    c = alpineSnow.clone();
    c.r = clamp(c.r + peakGleam, 0.9, 1);
    c.g = clamp(c.g + peakGleam, 0.9, 1);
  }

  // Biome regional tint for mid-elevation flora
  if (h > WATER_LEVEL + 0.5 && h < 18.0) {
    if (biome === 'forest') c.lerp(forestTintColor, 0.24);
    else if (biome === 'meadow') c.lerp(meadowTintColor, 0.15);
    else if (biome === 'wetland') c.lerp(wetlandTintColor, 0.30);
  }

  return c;
}

// GLSL chunk shader snippet for GPU-based displacement mapping and geological strata
export const GPU_TERRAIN_SHADER_SNIPPET = {
  vertexUniforms: `
    uniform float uDispScale;
    uniform float uTime;
    varying vec3 vWorldPosition;
  `,
  vertexDisplacement: `
    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    vWorldPosition = worldPos.xyz;

    // GPU-based micro displacement for riverbed ripples, soil strata, and mountain crags
    float wx = worldPos.x;
    float wz = worldPos.z;
    float wy = worldPos.y;

    // High mountain crag displacement (GPU-accelerated fine detail)
    float isMtn = clamp((wy - 14.0) / 12.0, 0.0, 1.0);
    float mtnDisp = (sin(wx * 0.22 + wz * 0.18) * 0.42 + cos(wx * 0.35 - wz * 0.28) * 0.35) * isMtn;

    // Riverbed & shoreline fine silt displacement
    float isWaterbed = clamp((1.8 - wy) / 1.5, 0.0, 1.0);
    float riverDisp = (sin(wx * 0.55 + wz * 0.45) * 0.08) * isWaterbed;

    transformed.y += (mtnDisp + riverDisp) * uDispScale;
  `,
  fragmentStrata: `
    varying vec3 vWorldPosition;
    // GPU-calculated geological soil strata enhancement
  `,
};
