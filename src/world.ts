import * as THREE from 'three';
import type { Biome } from './types';

export const SEED = 847231;
export const SIZE = 16;
export const WORLD_RADIUS = 18;
export const WORLD_DIAMETER = WORLD_RADIUS * 2 + 1;
export const WATER_LEVEL = 1.25;

// Key landmark coordinates (topologically anchored)
export const HOME_X = 8;
export const HOME_Z = 8;
export const HOME_BASE_HEIGHT = 6.4;
export const HOME_FLATTEN_RADIUS = 16.0;
export const HOME_CLEAR_MARGIN = 14.0;

export const VILLAGE_X = 64;
export const VILLAGE_Z = -44;
export const VILLAGE_BASE_HEIGHT = 5.8;
export const VILLAGE_RADIUS = 20;

export const ROAD_SPACING = 128;
export const ROAD_WIDTH = 5.5;

export type Landform =
  | 'ocean'
  | 'coast'
  | 'plains'
  | 'hills'
  | 'foothills'
  | 'mountain_slope'
  | 'mountain_ridge'
  | 'peak'
  | 'plateau'
  | 'valley'
  | 'basin'
  | 'canyon'
  | 'wetland';

export type WaterType =
  | 'none'
  | 'ocean'
  | 'lake'
  | 'river'
  | 'stream'
  | 'wetland'
  | 'spring';

export interface WorldFields {
  elevation: number;
  slope: number;
  landform: Landform;
  temperature: number; // in Celsius (-10 to 35)
  rainfall: number; // 0 (arid) to 1 (temperate rainforest)
  humidity: number; // 0 to 1
  soilMoisture: number; // 0 to 1
  waterDepth: number; // meters below water surface
  waterType: WaterType;
  flowVector: THREE.Vector2; // Downstream flow direction
  flowSpeed: number; // Flow speed in m/s
  flowAccumulation: number; // Upstream catchment volume
  windVector: THREE.Vector2; // Wind direction
  windSpeed: number; // Wind speed in m/s
  biome: Biome;
  vegetationDensity: number; // 0 to 1
}

// Utility functions
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const hash = (x: number, z: number, salt = 0) => {
  let n = Math.imul(Math.floor(x), 374761393) ^ Math.imul(Math.floor(z), 668265263) ^ Math.imul(SEED + salt, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

// Smooth 2D value noise
export function smoothNoise2D(x: number, z: number, scale: number): number {
  const sx = x * scale;
  const sz = z * scale;
  const x0 = Math.floor(sx);
  const z0 = Math.floor(sz);
  const fx = sx - x0;
  const fz = sz - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);

  const n00 = hash(x0, z0);
  const n10 = hash(x0 + 1, z0);
  const n01 = hash(x0, z0 + 1);
  const n11 = hash(x0 + 1, z0 + 1);

  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

// Fractal Brownian Motion for multi-octave terrain detail
export function fbm(x: number, z: number, octaves = 3, lacunarity = 2.0, gain = 0.5): number {
  let total = 0;
  let frequency = 1.0;
  let amplitude = 1.0;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    total += smoothNoise2D(x * frequency, z * frequency, 0.015) * amplitude;
    max += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return total / max;
}

// Landmark clearances
export const nearHome = (x: number, z: number) =>
  Math.hypot(x - HOME_X, z - HOME_Z) < HOME_FLATTEN_RADIUS + HOME_CLEAR_MARGIN;

export const nearVillage = (x: number, z: number) =>
  Math.hypot(x - VILLAGE_X, z - VILLAGE_Z) < VILLAGE_RADIUS;

// ============================================================================
// 1. GEOLOGICAL MODEL: MOUNTAIN SPINES & CONTINENTAL TOPOGRAPHY
// ============================================================================

interface MountainSpine {
  points: { x: number; z: number; peakH: number; width: number }[];
  style: 'alpine_crag' | 'massif' | 'plateau' | 'ridge';
}

// Intentional geological mountain range spines framing the river basin
const MOUNTAIN_SPINES: MountainSpine[] = [
  // Spine 1: Northern Alpine Range (sharp serrated peaks, snowline >45m)
  {
    style: 'alpine_crag',
    points: [
      { x: -280, z: -190, peakH: 65, width: 95 },
      { x: -160, z: -155, peakH: 82, width: 85 },
      { x: -40, z: -170, peakH: 94, width: 90 },
      { x: 80, z: -160, peakH: 88, width: 80 },
      { x: 200, z: -140, peakH: 74, width: 75 },
      { x: 300, z: -170, peakH: 60, width: 70 },
    ],
  },
  // Spine 2: Eastern Ridge & Granite Massif (broad high massif)
  {
    style: 'massif',
    points: [
      { x: 190, z: -120, peakH: 55, width: 70 },
      { x: 215, z: -20, peakH: 70, width: 80 },
      { x: 235, z: 80, peakH: 78, width: 85 },
      { x: 250, z: 180, peakH: 62, width: 75 },
    ],
  },
  // Spine 3: Southwestern Highlands & Stepped Plateau
  {
    style: 'plateau',
    points: [
      { x: -250, z: 40, peakH: 48, width: 75 },
      { x: -190, z: 140, peakH: 58, width: 80 },
      { x: -110, z: 210, peakH: 52, width: 85 },
      { x: -10, z: 230, peakH: 42, width: 70 },
    ],
  },
  // Spine 4: Southern Ridge rimming the valley
  {
    style: 'ridge',
    points: [
      { x: -60, z: 190, peakH: 38, width: 65 },
      { x: 50, z: 180, peakH: 46, width: 70 },
      { x: 160, z: 170, peakH: 42, width: 65 },
    ],
  },
];

function distToSegment2D(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): { dist: number; t: number } {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return { dist: Math.hypot(px - x1, pz - z1), t: 0 };
  let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
  t = clamp(t, 0, 1);
  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;
  return { dist: Math.hypot(px - projX, pz - projZ), t };
}

// Calculates geological mountain influence from spine structures
export function mountainStructureAt(x: number, z: number): {
  elevation: number;
  mask: number;
  style: MountainSpine['style'] | 'none';
  distanceToSpine: number;
} {
  // Clear valley around home and village
  const dHome = Math.hypot(x - HOME_X, z - HOME_Z);
  const dVillage = Math.hypot(x - VILLAGE_X, z - VILLAGE_Z);
  if (dHome < 50 || dVillage < 45) {
    return { elevation: 0, mask: 0, style: 'none', distanceToSpine: 999 };
  }

  // Valley clearance buffer (centered at 30, -15)
  const dCenter = Math.hypot(x - 30, z + 15);
  const valleyClearance = clamp((dCenter - 58) / 45, 0, 1);
  if (valleyClearance <= 0) {
    return { elevation: 0, mask: 0, style: 'none', distanceToSpine: 999 };
  }

  let maxElev = 0;
  let maxMask = 0;
  let dominantStyle: MountainSpine['style'] = 'ridge';
  let minSpineDist = 999;

  for (const spine of MOUNTAIN_SPINES) {
    for (let i = 0; i < spine.points.length - 1; i++) {
      const p1 = spine.points[i];
      const p2 = spine.points[i + 1];
      const { dist, t } = distToSegment2D(x, z, p1.x, p1.z, p2.x, p2.z);
      if (dist < minSpineDist) minSpineDist = dist;

      const segWidth = lerp(p1.width, p2.width, t);
      const segPeak = lerp(p1.peakH, p2.peakH, t);

      if (dist < segWidth) {
        // Natural mountain cross-section envelope:
        // Plain -> rolling hills -> foothills -> mountain slope -> ridge/peak
        const dNorm = dist / segWidth;
        const profile = Math.pow(Math.cos(dNorm * (Math.PI / 2)), 1.8);

        // Secondary geological structure: ridges, saddles, crags
        let detail = 0;
        if (spine.style === 'alpine_crag') {
          const crags = Math.abs(Math.sin(x * 0.045 + z * 0.032) * 4.2);
          const ridges = Math.cos(x * 0.033 - z * 0.045) * 3.5;
          const serrated = Math.abs(Math.cos(x * 0.07 + z * 0.06) * 2.0);
          detail = crags + ridges + serrated;
        } else if (spine.style === 'massif') {
          const broad = Math.sin(x * 0.02 + z * 0.02) * 3.5;
          const rocky = Math.cos(x * 0.04 - z * 0.03) * 2.2;
          detail = broad + rocky;
        } else if (spine.style === 'plateau') {
          // Flattened top above 70% profile height
          const stepped = Math.sin(x * 0.025 + z * 0.018) * 2.0;
          detail = stepped;
        } else {
          detail = Math.sin(x * 0.03 + z * 0.03) * 2.5;
        }

        const elevContribution = profile * (segPeak + detail);
        const maskContribution = profile;

        if (elevContribution > maxElev) {
          maxElev = elevContribution;
          maxMask = maskContribution;
          dominantStyle = spine.style;
        }
      }
    }
  }

  const finalMask = maxMask * valleyClearance;
  const finalElev = maxElev * valleyClearance;
  return {
    elevation: finalElev,
    mask: finalMask,
    style: finalMask > 0.05 ? dominantStyle : 'none',
    distanceToSpine: minSpineDist,
  };
}

// Backward-compatible mountainMaskAt
export const mountainMaskAt = (x: number, z: number): number => {
  return mountainStructureAt(x, z).mask;
};

// ============================================================================
// 2. HYDROLOGICAL DRAINAGE NETWORK
// ============================================================================

// Main river centerline formula
// Winds through the lower valley safely below home bluff (8, 8),
// naturally connecting Lake Silvermere (-85, -65) with Riverwood village (64, -44)
export function riverCenterlineZ(x: number): number {
  return Math.sin(x * 0.02 + 0.8) * 16 + Math.cos(x * 0.012) * 10 + x * 0.15 - 52;
}

// Tributary stream 1: North alpine mountain stream descending into the main river
export function tributaryCenterlineZ(x: number): number {
  return -160 + (x + 80) * 1.1 + Math.sin(x * 0.03) * 8.0;
}

export function riverDistanceAt(x: number, z: number): number {
  if (nearHome(x, z)) return 999;
  const expectedZ = riverCenterlineZ(x);
  const mainDist = Math.abs(z - expectedZ) * 0.88;

  // Tributary stream distance
  let tribDist = 999;
  if (x > -80 && x < 120 && z < -30) {
    const tribZ = tributaryCenterlineZ(x);
    tribDist = Math.abs(z - tribZ) * 0.95;
  }

  return Math.min(mainDist, tribDist);
}

export function isRiverAt(x: number, z: number, width = 7.5): boolean {
  if (nearHome(x, z)) return false;
  return riverDistanceAt(x, z) < width / 2;
}

// Lake Silvermere basin: Lowland natural lake in the western valley
export const LAKE_X = -85;
export const LAKE_Z = -65;
export const LAKE_RADIUS = 32;

export function lakeSignalAt(x: number, z: number): number {
  return Math.sin(x * 0.011 + z * 0.017) + Math.cos(x * 0.019 - z * 0.009);
}

export function lakeDepressionAt(x: number, z: number, ground = 6.0): number {
  if (nearHome(x, z) || nearVillage(x, z)) return 0;
  // Deep parabolic basin in the western valley connecting to river
  const dLake = Math.hypot(x - LAKE_X, z - LAKE_Z);
  if (dLake < LAKE_RADIUS) {
    const t = 1 - dLake / LAKE_RADIUS;
    const smooth = t * t * (3 - 2 * t);
    const targetBed = WATER_LEVEL - 1.85; // Deep freshwater lake
    return smooth * Math.max(0, ground - targetBed);
  }
  // Secondary natural lowland depression
  const edge = clamp((lakeSignalAt(x, z) - 1.25) / 0.44, 0, 1);
  const smooth = edge * edge * (3 - 2 * edge);
  const lowland = clamp((WATER_LEVEL + 1.8 - rawTerrainHeightAt(x, z)) / 1.5, 0, 1);
  return smooth * lowland * 1.5;
}

// Physical river channel cut down below WATER_LEVEL
export function riverCarveAt(x: number, z: number, ground = 6.0): number {
  if (nearHome(x, z) || nearVillage(x, z)) return 0;
  const rDist = riverDistanceAt(x, z);
  const riverHalfWidth = 7.2;
  if (rDist > riverHalfWidth) return 0;
  const t = 1 - rDist / riverHalfWidth;
  const smooth = t * t * (3 - 2 * t);
  const targetBed = WATER_LEVEL - 0.70; // 0.7m clean river depth
  return smooth * Math.max(0, ground - targetBed);
}

// ============================================================================
// 3. ELEVATION FIELD & TOPOGRAPHY
// ============================================================================

export function rawTerrainHeightAt(x: number, z: number): number {
  const broad = Math.sin(x * 0.015) * 1.8 + Math.cos(z * 0.018) * 1.5;
  const hills = Math.sin((x + z) * 0.038) * 0.95 + Math.cos((x - z) * 0.028) * 0.75;
  const mtn = mountainStructureAt(x, z);

  return broad + hills + 5.2 + mtn.elevation;
}

export function terrainHeightAt(x: number, z: number): number {
  const raw = rawTerrainHeightAt(x, z);

  const dHome = Math.hypot(x - HOME_X, z - HOME_Z);
  let ground = raw;
  if (dHome < HOME_FLATTEN_RADIUS) {
    const t = 1 - dHome / HOME_FLATTEN_RADIUS;
    ground = raw + (HOME_BASE_HEIGHT - raw) * (t * t * (3 - 2 * t));
  } else if (nearHome(x, z)) {
    ground = Math.max(HOME_BASE_HEIGHT - 1.0, raw);
  }

  const dVillage = Math.hypot(x - VILLAGE_X, z - VILLAGE_Z);
  if (dVillage < VILLAGE_RADIUS) {
    const t = 1 - dVillage / VILLAGE_RADIUS;
    ground = ground + (VILLAGE_BASE_HEIGHT - ground) * (t * t * (3 - 2 * t) * 0.7);
  }

  const lakeDepth = lakeDepressionAt(x, z, ground);
  const riverDepth = riverCarveAt(x, z, ground);
  return Math.max(0.2, ground - Math.max(lakeDepth, riverDepth));
}

export function waterDepthAt(x: number, z: number): number {
  if (nearHome(x, z)) return 0;
  const th = terrainHeightAt(x, z);
  return Math.max(0, WATER_LEVEL - th);
}

export function waterAt(x: number, z: number): boolean {
  if (nearHome(x, z)) return false;
  return waterDepthAt(x, z) > 0.02;
}

// Slope angle calculation in radians
export function terrainSlopeAt(x: number, z: number, delta = 0.8): { slope: number; normal: THREE.Vector3 } {
  const hL = terrainHeightAt(x - delta, z);
  const hR = terrainHeightAt(x + delta, z);
  const hD = terrainHeightAt(x, z - delta);
  const hU = terrainHeightAt(x, z + delta);

  const dx = (hR - hL) / (2 * delta);
  const dz = (hU - hD) / (2 * delta);
  const slope = Math.atan(Math.hypot(dx, dz));

  const normal = new THREE.Vector3(-dx, 1, -dz).normalize();
  return { slope, normal };
}

// ============================================================================
// 4. CLIMATE, ATMOSPHERE & OROGRAPHIC RAIN SHADOW
// ============================================================================

// Prevailing wind blowing from South-West (ocean side) toward North-East
export const PREVAILING_WIND_DIR = new THREE.Vector2(0.7071, -0.7071);
export const BASE_WIND_SPEED = 4.5; // m/s

export function climateFieldsAt(x: number, z: number): {
  temperature: number;
  rainfall: number;
  humidity: number;
  soilMoisture: number;
} {
  const elev = terrainHeightAt(x, z);

  // 1. Temperature Lapse Rate: ~6.5°C drop per 100m equivalent
  // Lowlands (elev 2-6m): 21°C - 23°C
  // Foothills (elev 15-25m): 14°C - 18°C
  // Alpine (>45m): -4°C to 2°C (snowline)
  const baseTemp = 23.0;
  const lapseRate = 0.42; // °C per meter
  const temperature = baseTemp - elev * lapseRate;

  // 2. Prevailing Wind & Orographic Precipitation (Rain Shadow)
  // Moist ocean air arrives along wind vector (+X, -Z).
  // Facing the wind on mountain slopes forces air upwards -> high rainfall!
  // Behind the mountain crests (leeward) -> dry rain shadow.
  const mtn = mountainStructureAt(x, z);
  const slopeInfo = terrainSlopeAt(x, z, 1.5);

  // Direction dot product with wind: positive means facing into oncoming moist wind
  const windwardExposure = clamp(
    (slopeInfo.normal.x * PREVAILING_WIND_DIR.x + slopeInfo.normal.z * PREVAILING_WIND_DIR.y) * 1.5,
    -1,
    1
  );

  let orographicRain = 0.5; // Baseline temperate rain
  if (mtn.mask > 0.1) {
    if (windwardExposure > 0) {
      // Wet windward side: heavy rain, lush alpine moss and mountain streams
      orographicRain += windwardExposure * 0.38 * mtn.mask;
    } else {
      // Dry leeward side: rain shadow!
      orographicRain -= Math.abs(windwardExposure) * 0.32 * mtn.mask;
    }
  }

  // Broad moisture variation
  const macroMoisture = Math.sin(x * 0.008 + 1.0) * 0.15 + Math.cos(z * 0.009 - 0.5) * 0.12;
  const rainfall = clamp(orographicRain + macroMoisture, 0.08, 0.98);

  // 3. Humidity: function of rainfall, temperature, and proximity to water
  const wDepth = waterDepthAt(x, z);
  const nearWaterBonus = wDepth > 0 ? 0.3 : isRiverAt(x, z, 18) ? 0.2 : 0;
  const humidity = clamp(rainfall * 0.75 + nearWaterBonus + (temperature < 5 ? 0.15 : 0), 0.1, 1.0);

  // 4. Soil Moisture: depends on rainfall, drainage slope, and water bodies
  // Steep rocky slopes drain immediately; valleys and lake margins hold moisture
  const slopeDrainage = Math.cos(slopeInfo.slope); // 1 on flat, 0 on cliff
  const rDist = riverDistanceAt(x, z);
  const riverHydration = clamp((22 - rDist) / 22, 0, 1) * 0.45;
  const lakeHydration = clamp((LAKE_RADIUS + 15 - Math.hypot(x - LAKE_X, z - LAKE_Z)) / 30, 0, 1) * 0.5;

  const soilMoisture = clamp(
    rainfall * 0.5 * slopeDrainage + riverHydration + lakeHydration + (wDepth > 0 ? 0.4 : 0),
    0.05,
    1.0
  );

  return { temperature, rainfall, humidity, soilMoisture };
}

// ============================================================================
// 5. WATER FLOW VECTORS & HYDROLOGICAL VELOCITY
// ============================================================================

export function waterFlowAt(x: number, z: number): {
  flowVector: THREE.Vector2;
  flowSpeed: number;
  flowAccumulation: number;
  waterType: WaterType;
} {
  const depth = waterDepthAt(x, z);
  const isWet = depth > 0.02;

  if (!isWet) {
    return {
      flowVector: new THREE.Vector2(0, 0),
      flowSpeed: 0,
      flowAccumulation: 0,
      waterType: 'none',
    };
  }

  // Check if in Lake Silvermere
  const dLake = Math.hypot(x - LAKE_X, z - LAKE_Z);
  if (dLake < LAKE_RADIUS) {
    // Lake: slow circular gentle wind-driven circulation
    const tangX = -(z - LAKE_Z) / (dLake + 0.1);
    const tangZ = (x - LAKE_X) / (dLake + 0.1);
    return {
      flowVector: new THREE.Vector2(tangX, tangZ).normalize(),
      flowSpeed: 0.25, // Gentle lake drift
      flowAccumulation: 45,
      waterType: 'lake',
    };
  }

  // River flow calculation: follows river tangent downstream
  // dx = 1, dz = d(centerlineZ)/dx
  // Tangent = (1, dz/dx). River flows eastward (+X) toward the ocean delta
  const rDist = riverDistanceAt(x, z);
  if (rDist < 12) {
    const delta = 1.0;
    const zNext = riverCenterlineZ(x + delta);
    const zPrev = riverCenterlineZ(x - delta);
    const dirX = 2 * delta;
    const dirZ = zNext - zPrev;
    const flowVec = new THREE.Vector2(dirX, dirZ).normalize();

    // Flow speed: faster on steeper drops, slower in wide bends
    // Downstream accumulation increases towards eastern plains
    const accumulation = clamp(10 + (x + 200) * 0.1, 5, 60);
    const slope = terrainSlopeAt(x, z).slope;
    const flowSpeed = clamp(1.2 + slope * 3.5 + accumulation * 0.02, 0.8, 4.2);

    return {
      flowVector: flowVec,
      flowSpeed,
      flowAccumulation: accumulation,
      waterType: accumulation > 25 ? 'river' : 'stream',
    };
  }

  // Lowland wetland / marsh
  return {
    flowVector: new THREE.Vector2(0, 0),
    flowSpeed: 0.1,
    flowAccumulation: 5,
    waterType: 'wetland',
  };
}

// ============================================================================
// 6. MASTER WORLD FIELD QUERY
// ============================================================================

export function queryWorldFields(x: number, z: number): WorldFields {
  const elev = terrainHeightAt(x, z);
  const slopeInfo = terrainSlopeAt(x, z);
  const mtn = mountainStructureAt(x, z);
  const climate = climateFieldsAt(x, z);
  const flow = waterFlowAt(x, z);

  // Landform classification
  let landform: Landform = 'plains';
  if (flow.waterType === 'lake') landform = 'basin';
  else if (flow.waterType === 'river' || flow.waterType === 'stream') landform = 'valley';
  else if (flow.waterType === 'wetland') landform = 'wetland';
  else if (mtn.mask > 0.7 && elev > 48.0) landform = 'peak';
  else if (mtn.mask > 0.5 && elev > 32.0) landform = 'mountain_ridge';
  else if (mtn.style === 'plateau' && elev > 30.0 && slopeInfo.slope < 0.25) landform = 'plateau';
  else if (mtn.mask > 0.25) landform = 'mountain_slope';
  else if (elev > 14.0) landform = 'foothills';
  else if (slopeInfo.slope > 0.3) landform = 'hills';

  // Biome determination
  let biome: Biome = 'meadow';
  if (flow.waterType === 'river' || flow.waterType === 'stream') {
    biome = 'riverbank';
  } else if (flow.waterType === 'lake' || flow.waterType === 'wetland' || waterAt(x, z)) {
    biome = elev < 1.8 ? 'wetland' : 'shore';
  } else if (elev > 24.0) {
    biome = 'alpine';
  } else {
    // Forest density determined by rainfall and soil moisture
    const forestScore = climate.rainfall * 0.6 + climate.soilMoisture * 0.4;
    biome = forestScore > 0.48 ? 'forest' : 'meadow';
  }

  // Vegetation suitability
  const vegDensity = clamp(
    (climate.soilMoisture * 0.6 + climate.rainfall * 0.4) * (1 - clamp((elev - 24) / 20, 0, 1)),
    0,
    1
  );

  return {
    elevation: elev,
    slope: slopeInfo.slope,
    landform,
    temperature: climate.temperature,
    rainfall: climate.rainfall,
    humidity: climate.humidity,
    soilMoisture: climate.soilMoisture,
    waterDepth: waterDepthAt(x, z),
    waterType: flow.waterType,
    flowVector: flow.flowVector,
    flowSpeed: flow.flowSpeed,
    flowAccumulation: flow.flowAccumulation,
    windVector: PREVAILING_WIND_DIR.clone(),
    windSpeed: BASE_WIND_SPEED,
    biome,
    vegetationDensity: vegDensity,
  };
}

// Backward-compatible biomeAt
export function biomeAt(x: number, z: number): Biome {
  return queryWorldFields(x, z).biome;
}

// Road network
export const roadAt = (x: number, z: number) => {
  const mx = Math.abs((((x + ROAD_SPACING / 2) % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING - ROAD_SPACING / 2);
  const mz = Math.abs((((z + ROAD_SPACING / 2) % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING - ROAD_SPACING / 2);
  const toVillageDist = distToSegment(x, z, HOME_X, HOME_Z, VILLAGE_X, VILLAGE_Z);
  return mx < ROAD_WIDTH / 2 || mz < ROAD_WIDTH / 2 || toVillageDist < 2.6;
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

// ============================================================================
// 7. WORLD MODEL CLASS (DETERMINISTIC GEOLOGICAL FOUNDATION)
// ============================================================================

export interface GeologicalLayers {
  elevation: number;
  slope: number;
  slopeNormal: THREE.Vector3;
  moisture: number; // soil moisture in [0, 1]
  temperature: number; // in Celsius (-25°C to 35°C)
}

/**
 * WorldModel
 * Encapsulates the deterministic foundation of the world:
 * Elevation, Slope, Moisture, and Temperature.
 * Completely independent of chunk streaming, meshes, and rendering.
 */
export class WorldModel {
  readonly seed: number;

  constructor(seed: number = SEED) {
    this.seed = seed;
  }

  /** Base Geological Layer 1: Deterministic Elevation (m) */
  getElevation(x: number, z: number): number {
    return terrainHeightAt(x, z);
  }

  /** Base Geological Layer 2: Deterministic Slope & Normal */
  getSlope(x: number, z: number, delta = 0.8): { slope: number; normal: THREE.Vector3 } {
    return terrainSlopeAt(x, z, delta);
  }

  /** Base Geological Layer 3: Deterministic Soil Moisture [0, 1] */
  getMoisture(x: number, z: number): number {
    return climateFieldsAt(x, z).soilMoisture;
  }

  /** Base Geological Layer 4: Deterministic Temperature (°C) */
  getTemperature(x: number, z: number): number {
    return climateFieldsAt(x, z).temperature;
  }

  /** Sample the 4 primary geological layers simultaneously */
  getGeologicalLayers(x: number, z: number, delta = 0.8): GeologicalLayers {
    const elevation = this.getElevation(x, z);
    const { slope, normal: slopeNormal } = this.getSlope(x, z, delta);
    const climate = climateFieldsAt(x, z);
    return {
      elevation,
      slope,
      slopeNormal,
      moisture: climate.soilMoisture,
      temperature: climate.temperature,
    };
  }

  /** Query complete environmental, hydrological, and atmospheric fields */
  queryFields(x: number, z: number): WorldFields {
    return queryWorldFields(x, z);
  }

  /** Water depth at coordinate */
  getWaterDepth(x: number, z: number): number {
    return waterDepthAt(x, z);
  }

  /** True if point is submerged in water */
  hasWater(x: number, z: number): boolean {
    return waterAt(x, z);
  }

  /** Downstream water flow vector and speed */
  getWaterFlow(x: number, z: number) {
    return waterFlowAt(x, z);
  }

  /** Biome classification at coordinate */
  getBiome(x: number, z: number): Biome {
    return biomeAt(x, z);
  }
}

export const defaultWorldModel = new WorldModel(SEED);

