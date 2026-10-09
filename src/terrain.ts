import * as THREE from 'three';
import type { Biome } from './types';
export * from './world';
import {
  WATER_LEVEL,
  nearHome,
  nearVillage,
  rawTerrainHeightAt,
  terrainHeightAt,
  riverDistanceAt,
  lakeDepressionAt,
  riverCarveAt,
  waterDepthAt,
  waterAt,
  mountainMaskAt,
  mountainStructureAt,
  climateFieldsAt,
  queryWorldFields,
  clamp,
} from './world';

// Backward-compatible helper for mountain noise
export const mountainNoiseAt = (x: number, z: number) => {
  const sharpCrags = Math.abs(Math.sin(x * 0.042 + z * 0.028) * 3.8);
  const ridges = Math.cos(x * 0.031 - z * 0.042) * 3.2;
  const fine = Math.sin((x - z) * 0.075) * 1.8;
  const serrated = Math.abs(Math.cos(x * 0.065 + z * 0.055) * 1.6);
  return sharpCrags + ridges + fine + serrated;
};

// --- SOIL, ROCK, STRATA & MOUNTAIN COLOR PALETTE ---
export const grassColor = new THREE.Color(0x5b6849);
export const darkSoilColor = new THREE.Color(0x382618); // Rich dark humus topsoil
export const richLoamSoil = new THREE.Color(0x4a3424); // Loamy fertile soil layer
export const subsoilClay = new THREE.Color(0x7c492e); // Reddish-brown clay strata layer
export const deepSandstone = new THREE.Color(0x8f6a4a); // Sedimentary sandstone strata
export const shaleBedrock = new THREE.Color(0x2d3035); // Dark slate/shale bedrock
export const mountainGranite = new THREE.Color(0x727376); // High mountain granite
export const cliffDarkRock = new THREE.Color(0x3f3e3c);
export const alpineSnow = new THREE.Color(0xdfe1df);
export const forestTintColor = new THREE.Color(0x3d4936);
export const meadowTintColor = new THREE.Color(0x69714f);
export const wetlandTintColor = new THREE.Color(0x5c5c45);
const apocalypseTintColor = new THREE.Color(0x595a50);

export const dryBeachSand = new THREE.Color(0xa59a75);
export const wetShorelineSand = new THREE.Color(0x76664f);
export const submergedPebbles = new THREE.Color(0x484439);
export const riverbankSand = new THREE.Color(0xb5a77b);

// Compute soil strata layer and color for cutaways, riverbeds and mountains
export function terrainColorAt(h: number, x: number, z: number, biome: Biome): THREE.Color {
  let c: THREE.Color;

  // Water is a world-field property, not an absolute-height test. Rivers can
  // exist at high elevations, so never paint submerged channel terrain green.
  const wetDepth = waterDepthAt(x, z);
  if (wetDepth > 0.02) {
    const pebbleNoise = Math.sin(x * 0.8 + z * 0.9) * 0.5 + 0.5;
    const depthShade = clamp(wetDepth / 4.0, 0, 1);
    c = submergedPebbles.clone()
      .lerp(richLoamSoil, pebbleNoise * 0.20)
      .lerp(mountainGranite, depthShade * 0.12);
    return c;
  }

  const waterDist = h - WATER_LEVEL;

  // Low-elevation shoreline sediment for the land just above sea level.
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
    c = dryBeachSand.clone().lerp(darkSoilColor, t * 0.65).lerp(grassColor, t);
  } else if (h < 7.5) {
    // Lush meadow / homestead bluff / forest floor with rich organic topsoil
    const soilNoise = Math.sin(x * 0.35 + z * 0.28) * 0.5 + 0.5;
    c = grassColor.clone().lerp(darkSoilColor, soilNoise * 0.18);
  } else if (h < 15.0) {
    // Foothills transitioning through subsoil clay strata and stone
    const t = (h - 7.5) / 7.5;
    const strataBand = Math.sin(h * 2.2 + x * 0.05) * 0.5 + 0.5;
    c = grassColor.clone().lerp(subsoilClay, t * 0.65).lerp(deepSandstone, strataBand * 0.4).lerp(mountainGranite, t);
  } else if (h < 32.0) {
    // Sub-alpine rocky cliffs with visible geological sedimentary strata banding
    const strataBand = Math.sin(h * 1.6 + Math.sin(x * 0.08 + z * 0.04) * 2.0) * 0.5 + 0.5;
    const t = (h - 15.0) / 17.0;
    c = mountainGranite.clone().lerp(cliffDarkRock, t);
    c.lerp(shaleBedrock, strataBand * 0.42);
    if (strataBand > 0.7) c.lerp(subsoilClay, 0.28);
  } else if (h < 48.0) {
    // High mountain peaks: dark granite transitioning into snow line
    const t = (h - 32.0) / 16.0;
    c = cliffDarkRock.clone().lerp(alpineSnow, t);
  } else {
    // Towering alpine summits covered in eternal glacier snow and ice
    const peakGleam = Math.sin(x * 0.1 + z * 0.1) * 0.05;
    c = alpineSnow.clone();
    c.r = clamp(c.r + peakGleam, 0.9, 1);
    c.g = clamp(c.g + peakGleam, 0.9, 1);
  }

  // Snow follows cold alpine conditions instead of being a decorative
  // height-only band. Render-time approximation keeps chunk generation light.
  const renderTemperature = 23.0 - h * 0.42;
  const freeze = clamp((2.0 - renderTemperature) / 7.5, 0, 1);
  const snowline = clamp((h - 34.0) / 24.0, 0, 1);
  const snowCoverage = clamp(freeze * 0.82 + snowline * 0.35, 0, 1);
  if (snowCoverage > 0.01) {
    const snowNoise = 0.82 + 0.18 * (Math.sin(x * 0.09 + z * 0.07) * 0.5 + 0.5);
    c.lerp(alpineSnow, clamp(snowCoverage * snowNoise, 0, 0.94));
  }

  // Biome regional tint for mid-elevation flora
  if (h > WATER_LEVEL + 0.5 && h < 24.0) {
    if (biome === 'forest') c.lerp(forestTintColor, 0.24);
    else if (biome === 'meadow') c.lerp(meadowTintColor, 0.15);
    else if (biome === 'wetland') c.lerp(wetlandTintColor, 0.30);
  }

  // Muted, dust-stained palette gives the survival branch a ruined-world mood without adding post-processing cost.
  c.lerp(apocalypseTintColor, 0.14);
  c.multiplyScalar(0.96);
  return c;
}

