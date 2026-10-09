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
  flowAccumulation: number; // Effective upstream catchment runoff area
  flowDrop: number; // Vertical drop to the next drainage cell (m)
  snowDepth: number; // 0 to 1 seasonal/surface snow coverage
  iceThickness: number; // 0 to 1 frozen-water surface thickness proxy
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
//
// Causal world pipeline:
// geology/elevation + rainfall -> depression conditioning -> flow directions
// -> runoff accumulation -> streams/tributaries/rivers -> lakes/ocean.
//
// The 4 m lattice is a simulation/lookup mechanism, not a chunk boundary.

const HYDRO_MIN = -320;
const HYDRO_MAX = 320;
const HYDRO_RESOLUTION = 4;
const HYDRO_N = Math.floor((HYDRO_MAX - HYDRO_MIN) / HYDRO_RESOLUTION) + 1;
const HYDRO_COUNT = HYDRO_N * HYDRO_N;
const HYDRO_CELL_AREA = HYDRO_RESOLUTION * HYDRO_RESOLUTION;

const SPRING_RUNOFF_THRESHOLD = 42;
const STREAM_RUNOFF_THRESHOLD = 180;
const RIVER_RUNOFF_THRESHOLD = 900;

interface HydrologyGrid {
  baseElevation: Float32Array;
  filledElevation: Float32Array;
  runoff: Float32Array;
  flowAccumulation: Float32Array;
  flowTo: Int32Array;
  flowDx: Float32Array;
  flowDz: Float32Array;
  flowDrop: Float32Array;
  channelStrength: Float32Array;
  waterSurface: Float32Array;
  waterDepth: Float32Array;
  waterBed: Float32Array;
  waterPresence: Float32Array;
  lakeMask: Uint8Array;
  oceanMask: Uint8Array;
}

interface HydrologySample {
  baseElevation: number;
  filledElevation: number;
  flowAccumulation: number;
  channelStrength: number;
  lake: boolean;
  ocean: boolean;
  flowVector: THREE.Vector2;
  flowDrop: number;
}

class MinHeap {
  private heap: { index: number; priority: number }[] = [];

  push(index: number, priority: number): void {
    const item = { index, priority };
    this.heap.push(item);
    let i = this.heap.length - 1;

    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heap[p].priority <= item.priority) break;
      this.heap[i] = this.heap[p];
      i = p;
    }
    this.heap[i] = item;
  }

  pop(): { index: number; priority: number } | undefined {
    if (this.heap.length === 0) return undefined;

    const root = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      let i = 0;
      while (true) {
        const left = i * 2 + 1;
        const right = left + 1;
        if (left >= this.heap.length) break;

        let child = left;
        if (right < this.heap.length && this.heap[right].priority < this.heap[left].priority) {
          child = right;
        }
        if (this.heap[child].priority >= last.priority) break;

        this.heap[i] = this.heap[child];
        i = child;
      }
      this.heap[i] = last;
    }

    return root;
  }
}

const hydrologyDirections = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
  { dx: 1, dz: 1 },
  { dx: 1, dz: -1 },
  { dx: -1, dz: 1 },
  { dx: -1, dz: -1 },
];

function hydroIndex(ix: number, iz: number): number {
  return iz * HYDRO_N + ix;
}

function hydroCoords(x: number, z: number): { gx: number; gz: number } {
  return {
    gx: clamp((x - HYDRO_MIN) / HYDRO_RESOLUTION, 0, HYDRO_N - 1),
    gz: clamp((z - HYDRO_MIN) / HYDRO_RESOLUTION, 0, HYDRO_N - 1),
  };
}

function baseSlopeAt(x: number, z: number): number {
  const d = 2.0;
  const hL = rawTerrainHeightAt(x - d, z);
  const hR = rawTerrainHeightAt(x + d, z);
  const hD = rawTerrainHeightAt(x, z - d);
  const hU = rawTerrainHeightAt(x, z + d);
  return Math.atan(Math.hypot((hR - hL) / (2 * d), (hU - hD) / (2 * d)));
}

// Solver rainfall is independent of carved water to avoid circular hydrology.
function hydrologyRainfallAt(x: number, z: number): number {
  const mtn = mountainStructureAt(x, z);
  const slope = baseSlopeAt(x, z);
  const d = 1.5;
  const dx = (rawTerrainHeightAt(x + d, z) - rawTerrainHeightAt(x - d, z)) / (2 * d);
  const dz = (rawTerrainHeightAt(x, z + d) - rawTerrainHeightAt(x, z - d)) / (2 * d);
  const normal = new THREE.Vector3(-dx, 1, -dz).normalize();

  const windward = clamp(
    (normal.x * PREVAILING_WIND_DIR.x + normal.z * PREVAILING_WIND_DIR.y) * 1.5,
    -1,
    1
  );

  let rain = 0.47;
  if (mtn.mask > 0.08) {
    rain += windward > 0
      ? windward * 0.34 * mtn.mask
      : -Math.abs(windward) * 0.28 * mtn.mask;
  }

  rain += Math.sin(x * 0.008 + 1.0) * 0.12 + Math.cos(z * 0.009 - 0.5) * 0.10;

  const runoffBias = 0.85 + clamp(slope / 0.9, 0, 1) * 0.25;
  return clamp(rain * runoffBias, 0.08, 0.98);
}

function hydrologyBaseElevationAt(x: number, z: number): number {
  let h = rawTerrainHeightAt(x, z);

  // Keep settlement clearings out of drainage paths without altering the
  // visible geological height field.
  if (nearHome(x, z)) h = Math.max(h, HOME_BASE_HEIGHT + 0.65);
  if (nearVillage(x, z)) h = Math.max(h, VILLAGE_BASE_HEIGHT + 0.65);

  return h;
}

function buildHydrology(): HydrologyGrid {
  const baseElevation = new Float32Array(HYDRO_COUNT);
  const filledElevation = new Float32Array(HYDRO_COUNT);
  const runoff = new Float32Array(HYDRO_COUNT);
  const flowAccumulation = new Float32Array(HYDRO_COUNT);
  const flowTo = new Int32Array(HYDRO_COUNT);
  const flowDx = new Float32Array(HYDRO_COUNT);
  const flowDz = new Float32Array(HYDRO_COUNT);
  const flowDrop = new Float32Array(HYDRO_COUNT);
  const channelStrength = new Float32Array(HYDRO_COUNT);
  const waterSurface = new Float32Array(HYDRO_COUNT);
  const waterDepth = new Float32Array(HYDRO_COUNT);
  const waterBed = new Float32Array(HYDRO_COUNT);
  const waterPresence = new Float32Array(HYDRO_COUNT);
  const lakeMask = new Uint8Array(HYDRO_COUNT);
  const oceanMask = new Uint8Array(HYDRO_COUNT);

  for (let iz = 0; iz < HYDRO_N; iz++) {
    const z = HYDRO_MIN + iz * HYDRO_RESOLUTION;
    for (let ix = 0; ix < HYDRO_N; ix++) {
      const x = HYDRO_MIN + ix * HYDRO_RESOLUTION;
      const i = hydroIndex(ix, iz);
      const h = hydrologyBaseElevationAt(x, z);

      baseElevation[i] = h;
      filledElevation[i] = h;

      const rainfall = hydrologyRainfallAt(x, z);
      const slope = baseSlopeAt(x, z);
      const runoffCoeff = 0.32 + clamp(slope / 0.9, 0, 1) * 0.58;
      runoff[i] = rainfall * runoffCoeff * HYDRO_CELL_AREA;
      flowTo[i] = -1;
    }
  }

  // Priority-flood conditions depressions so each cell can drain toward an
  // actual spill route. Parent links give deterministic routing across flats.
  const visited = new Uint8Array(HYDRO_COUNT);
  const parent = new Int32Array(HYDRO_COUNT);
  const floodOrder = new Int32Array(HYDRO_COUNT);
  floodOrder.fill(-1);
  parent.fill(-1);
  const heap = new MinHeap();
  let nextFloodOrder = 0;

  const seedBoundary = (ix: number, iz: number) => {
    const i = hydroIndex(ix, iz);
    if (visited[i]) return;
    visited[i] = 1;
    heap.push(i, baseElevation[i]);
  };

  for (let ix = 0; ix < HYDRO_N; ix++) {
    seedBoundary(ix, 0);
    seedBoundary(ix, HYDRO_N - 1);
  }
  for (let iz = 1; iz < HYDRO_N - 1; iz++) {
    seedBoundary(0, iz);
    seedBoundary(HYDRO_N - 1, iz);
  }

  while (true) {
    const item = heap.pop();
    if (!item) break;

    const i = item.index;
    floodOrder[i] = nextFloodOrder++;
    const ix = i % HYDRO_N;
    const iz = Math.floor(i / HYDRO_N);

    for (const d of hydrologyDirections) {
      const nx = ix + d.dx;
      const nz = iz + d.dz;
      if (nx < 0 || nx >= HYDRO_N || nz < 0 || nz >= HYDRO_N) continue;

      const ni = hydroIndex(nx, nz);
      if (visited[ni]) continue;

      visited[ni] = 1;
      parent[ni] = i;
      filledElevation[ni] = Math.max(baseElevation[ni], filledElevation[i]);
      heap.push(ni, filledElevation[ni]);
    }
  }

  // Route each cell to the steepest available lower conditioned neighbor.
  // Flood-tree parents are the fallback for true flats/depression floors.
  for (let iz = 0; iz < HYDRO_N; iz++) {
    for (let ix = 0; ix < HYDRO_N; ix++) {
      const i = hydroIndex(ix, iz);
      let best = -1;
      let bestElevation = filledElevation[i];

      for (const d of hydrologyDirections) {
        const nx = ix + d.dx;
        const nz = iz + d.dz;
        if (nx < 0 || nx >= HYDRO_N || nz < 0 || nz >= HYDRO_N) continue;

        const ni = hydroIndex(nx, nz);
        const nh = filledElevation[ni];

        // Only strictly lower conditioned terrain can override the flood-tree
        // parent. Equal-height flats follow their parent toward an outlet.
        if (nh < bestElevation - 0.0001) {
          best = ni;
          bestElevation = nh;
        }
      }

      if (best < 0) {
        const parentIndex = parent[i];
        if (
          parentIndex >= 0 &&
          baseElevation[parentIndex] <= baseElevation[i] + 0.001
        ) {
          best = parentIndex;
        }
      }
      flowTo[i] = best;

      if (best >= 0) {
        const bx = best % HYDRO_N;
        const bz = Math.floor(best / HYDRO_N);
        const dx = bx - ix;
        const dz = bz - iz;
        const len = Math.hypot(dx, dz) || 1;

        flowDx[i] = dx / len;
        flowDz[i] = dz / len;
        flowDrop[i] = Math.max(0, baseElevation[i] - baseElevation[best]);
      }
    }
  }

  // Accumulate rainfall runoff from upstream to downstream. This is the
  // defining catchment calculation missing from the former river spline.
  const order = Array.from({ length: HYDRO_COUNT }, (_, i) => i);
  order.sort((a, b) =>
    filledElevation[b] - filledElevation[a] ||
    floodOrder[b] - floodOrder[a] ||
    baseElevation[b] - baseElevation[a] ||
    a - b
  );

  for (let i = 0; i < HYDRO_COUNT; i++) flowAccumulation[i] = runoff[i];
  for (const i of order) {
    const target = flowTo[i];
    if (target >= 0) flowAccumulation[target] += flowAccumulation[i];
  }

  // Open ocean is the connected component of below-waterline terrain that
  // touches the simulation boundary. Closed below-waterline depressions remain
  // candidates for inland lakes.
  const oceanQueue: number[] = [];
  const oceanVisited = new Uint8Array(HYDRO_COUNT);

  const queueOcean = (i: number) => {
    if (oceanVisited[i] || baseElevation[i] > WATER_LEVEL + 0.04) return;
    oceanVisited[i] = 1;
    oceanQueue.push(i);
  };

  for (let ix = 0; ix < HYDRO_N; ix++) {
    queueOcean(hydroIndex(ix, 0));
    queueOcean(hydroIndex(ix, HYDRO_N - 1));
  }
  for (let iz = 1; iz < HYDRO_N - 1; iz++) {
    queueOcean(hydroIndex(0, iz));
    queueOcean(hydroIndex(HYDRO_N - 1, iz));
  }

  for (let q = 0; q < oceanQueue.length; q++) {
    const i = oceanQueue[q];
    oceanMask[i] = 1;

    const ix = i % HYDRO_N;
    const iz = Math.floor(i / HYDRO_N);
    for (const d of hydrologyDirections) {
      const nx = ix + d.dx;
      const nz = iz + d.dz;
      if (nx < 0 || nx >= HYDRO_N || nz < 0 || nz >= HYDRO_N) continue;
      queueOcean(hydroIndex(nx, nz));
    }
  }

  // A lake is an enclosed depression with a meaningful spill depth.
  // Absolute elevation does not decide whether a mountain or basin lake exists:
  // a high-altitude lake is valid too.
  const candidate = new Uint8Array(HYDRO_COUNT);
  for (let i = 0; i < HYDRO_COUNT; i++) {
    const depressionDepth = filledElevation[i] - baseElevation[i];
    if (
      depressionDepth > 0.9 &&
      filledElevation[i] > WATER_LEVEL + 0.35 &&
      !oceanMask[i]
    ) {
      candidate[i] = 1;
    }
  }

  const componentVisited = new Uint8Array(HYDRO_COUNT);
  const component: number[] = [];

  for (let i = 0; i < HYDRO_COUNT; i++) {
    if (!candidate[i] || componentVisited[i]) continue;

    component.length = 0;
    const queue = [i];
    componentVisited[i] = 1;

    while (queue.length) {
      const ci = queue.pop()!;
      component.push(ci);

      const ix = ci % HYDRO_N;
      const iz = Math.floor(ci / HYDRO_N);
      for (const d of hydrologyDirections) {
        const nx = ix + d.dx;
        const nz = iz + d.dz;
        if (nx < 0 || nx >= HYDRO_N || nz < 0 || nz >= HYDRO_N) continue;

        const ni = hydroIndex(nx, nz);
        if (candidate[ni] && !componentVisited[ni]) {
          componentVisited[ni] = 1;
          queue.push(ni);
        }
      }
    }

    if (component.length >= 12) {
      for (const ci of component) lakeMask[ci] = 1;
    }
  }

  // Priority-flood pools include shallow rim cells (filled > base) that the
  // 0.9 m candidate test drops. Left dry, they sit below the lake surface and
  // the water reads as floating above the shore. Grow each lake to every
  // connected cell that shares its spill level.
  const pool: number[] = [];
  for (let i = 0; i < HYDRO_COUNT; i++) if (lakeMask[i]) pool.push(i);
  for (let q = 0; q < pool.length; q++) {
    const i = pool[q];
    const ix = i % HYDRO_N;
    const iz = Math.floor(i / HYDRO_N);
    for (const d of hydrologyDirections) {
      const nx = ix + d.dx;
      const nz = iz + d.dz;
      if (nx < 0 || nx >= HYDRO_N || nz < 0 || nz >= HYDRO_N) continue;

      const ni = hydroIndex(nx, nz);
      if (lakeMask[ni] || oceanMask[ni]) continue;
      if (filledElevation[ni] - baseElevation[ni] <= 0.02) continue;
      if (Math.abs(filledElevation[ni] - filledElevation[i]) > 0.01) continue;

      lakeMask[ni] = 1;
      pool.push(ni);
    }
  }

  // Catchment size controls persistent channel strength. Rivers form where
  // many upstream cells converge, while high alpine headwaters can become
  // springs before their catchment is large enough for a river.
  const logStart = Math.log1p(SPRING_RUNOFF_THRESHOLD);
  const logRiver = Math.log1p(9000);

  for (let i = 0; i < HYDRO_COUNT; i++) {
    const a = flowAccumulation[i];
    const hasDrainageRoute = flowTo[i] >= 0;
    const t = hasDrainageRoute
      ? clamp((Math.log1p(a) - logStart) / (logRiver - logStart), 0, 1)
      : 0;
    let strength = t * t * (3 - 2 * t);

    const ix = i % HYDRO_N;
    const iz = Math.floor(i / HYDRO_N);
    const x = HYDRO_MIN + ix * HYDRO_RESOLUTION;
    const z = HYDRO_MIN + iz * HYDRO_RESOLUTION;
    const slope = baseSlopeAt(x, z);

    if (
      a >= SPRING_RUNOFF_THRESHOLD &&
      baseElevation[i] > 24 &&
      slope > 0.22 &&
      !lakeMask[i] &&
      !oceanMask[i]
    ) {
      strength = Math.max(strength, 0.18);
    }

    // A terminal drainage cell has nowhere to send its runoff. Unless the
    // solver classified it as an ocean/lake reservoir, persistent channel water
    // would be physically unmotivated here. Treat insufficient terminal runoff
    // as evaporation rather than leaving a stranded river segment on land.
    if (flowTo[i] < 0 && !lakeMask[i] && !oceanMask[i]) {
      strength = 0;
    }

    channelStrength[i] = clamp(strength, 0, 1);
  }

  // Derive a single authoritative water surface + depth + bed field.
  // Terrain carving consumes the same bed field that the renderer samples, so
  // the visible ground cannot disagree with the water body it contains.
  for (let i = 0; i < HYDRO_COUNT; i++) {
    let surface = 0;
    let depth = 0;
    let presence = 0;

    if (oceanMask[i]) {
      surface = WATER_LEVEL;
      depth = Math.max(0, surface - baseElevation[i]);
      presence = depth > 0.02 ? 1 : 0;
    } else if (lakeMask[i]) {
      surface = Math.max(WATER_LEVEL, filledElevation[i]);
      const depressionDepth = Math.max(0, filledElevation[i] - baseElevation[i]);
      depth = clamp(1.35 + depressionDepth * 0.82, 1.35, 8.0);
      presence = 1;
    } else if (channelStrength[i] > 0.02) {
      // Keep the waterline close to the local terrain datum. The channel
      // bed is lowered by depth below; a large artificial hydraulic head here
      // makes rivers look like raised platforms and creates jump-height ledges.
      // Any true waterfall comes from a real downhill change between cells.
      surface =
        baseElevation[i] +
        0.025 +
        channelStrength[i] * 0.045;
      const catchmentFactor = clamp(
        Math.log1p(flowAccumulation[i]) / Math.log1p(9000),
        0,
        1
      );
      const rawTargetDepth = clamp(
        0.06 +
        catchmentFactor * 1.15 +
        Math.min(0.45, flowDrop[i] * 0.08),
        0.06,
        1.65
      );
      // Small headwaters taper naturally at their banks; mature rivers keep a
      // nearly full-width wet core. smoothstep avoids square hard edges.
      const mask = clamp((channelStrength[i] - 0.02) / 0.20, 0, 1);
      presence = mask * mask * (3 - 2 * mask);
      depth = rawTargetDepth * presence;
    }

    waterSurface[i] = surface;
    waterDepth[i] = depth;
    waterPresence[i] = presence;
    waterBed[i] = surface > 0 ? surface - depth : 0;
  }

  return {
    baseElevation,
    filledElevation,
    runoff,
    flowAccumulation,
    flowTo,
    flowDx,
    flowDz,
    flowDrop,
    channelStrength,
    waterSurface,
    waterDepth,
    waterBed,
    waterPresence,
    lakeMask,
    oceanMask,
  };
}

let hydrologyCache: HydrologyGrid | null = null;

export interface HydrologyDiagnostics {
  cells: number;
  oceanCells: number;
  lakeCells: number;
  channelCells: number;
  springCells: number;
  streamCells: number;
  riverCells: number;
  terminalCells: number;
  cycleCount: number;
  maxFlowAccumulation: number;
}

export function getHydrologyDiagnostics(): HydrologyDiagnostics {
  const grid = hydrologyGrid();
  let oceanCells = 0;
  let lakeCells = 0;
  let channelCells = 0;
  let springCells = 0;
  let streamCells = 0;
  let riverCells = 0;
  let terminalCells = 0;
  let maxFlowAccumulation = 0;

  for (let i = 0; i < HYDRO_COUNT; i++) {
    const a = grid.flowAccumulation[i];
    maxFlowAccumulation = Math.max(maxFlowAccumulation, a);
    if (grid.oceanMask[i]) oceanCells++;
    if (grid.lakeMask[i]) lakeCells++;
    if (grid.channelStrength[i] > 0.03 && !grid.oceanMask[i] && !grid.lakeMask[i]) {
      channelCells++;
      if (a < STREAM_RUNOFF_THRESHOLD || grid.flowDrop[i] > 2.2) springCells++;
      else if (a < RIVER_RUNOFF_THRESHOLD && grid.channelStrength[i] <= 0.58) streamCells++;
      else riverCells++;
    }
    if (grid.flowTo[i] < 0) terminalCells++;
  }

  // Every drainage cell has one outgoing edge; count directed cycles explicitly.
  // Valid watersheds terminate at the simulation boundary or an outlet.
  const state = new Uint8Array(HYDRO_COUNT);
  let cycleCount = 0;

  for (let start = 0; start < HYDRO_COUNT; start++) {
    if (state[start] === 2) continue;

    let current = start;
    const path: number[] = [];
    const local = new Map<number, number>();

    while (current >= 0 && state[current] !== 2) {
      const seenAt = local.get(current);
      if (seenAt !== undefined) {
        cycleCount++;
        break;
      }
      local.set(current, path.length);
      path.push(current);
      state[current] = 1;
      current = grid.flowTo[current];
    }

    for (const i of path) state[i] = 2;
  }

  return {
    cells: HYDRO_COUNT,
    oceanCells,
    lakeCells,
    channelCells,
    springCells,
    streamCells,
    riverCells,
    terminalCells,
    cycleCount,
    maxFlowAccumulation,
  };
}

function hydrologyGrid(): HydrologyGrid {
  if (!hydrologyCache) hydrologyCache = buildHydrology();
  return hydrologyCache;
}

function bilinear(array: Float32Array, gx: number, gz: number): number {
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(HYDRO_N - 1, x0 + 1);
  const z1 = Math.min(HYDRO_N - 1, z0 + 1);
  const tx = gx - x0;
  const tz = gz - z0;

  const a = array[hydroIndex(x0, z0)];
  const b = array[hydroIndex(x1, z0)];
  const c = array[hydroIndex(x0, z1)];
  const d = array[hydroIndex(x1, z1)];

  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

function bilinearWeighted(
  array: Float32Array,
  weights: Float32Array,
  gx: number,
  gz: number
): number {
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(HYDRO_N - 1, x0 + 1);
  const z1 = Math.min(HYDRO_N - 1, z0 + 1);
  const tx = gx - x0;
  const tz = gz - z0;

  const corners = [
    { i: hydroIndex(x0, z0), w: (1 - tx) * (1 - tz) },
    { i: hydroIndex(x1, z0), w: tx * (1 - tz) },
    { i: hydroIndex(x0, z1), w: (1 - tx) * tz },
    { i: hydroIndex(x1, z1), w: tx * tz },
  ];

  let sum = 0;
  let weightSum = 0;
  for (const corner of corners) {
    const presence = weights[corner.i];
    if (presence <= 0.001 || corner.w <= 0) continue;
    const w = corner.w * presence;
    sum += array[corner.i] * w;
    weightSum += w;
  }

  return weightSum > 0.0001 ? sum / weightSum : 0;
}

function hydrologyCellAt(x: number, z: number): { ix: number; iz: number; i: number } {
  const { gx, gz } = hydroCoords(x, z);
  const ix = Math.max(0, Math.min(HYDRO_N - 1, Math.round(gx)));
  const iz = Math.max(0, Math.min(HYDRO_N - 1, Math.round(gz)));
  return { ix, iz, i: hydroIndex(ix, iz) };
}

// Water must sit at least this far above the final (carved) ground to count as
// wet. Keeps a 3-7 cm hydraulic head from reading as a paper-thin film on banks.
const SHORE_EPS = 0.08;

interface WaterColumn {
  surface: number;
  depth: number; // full bed depth below surface (unscaled)
  shore: number; // 0 at the wet-footprint edge -> 1 in the core
  ocean: boolean;
}

function wetNode(grid: HydrologyGrid, i: number): number {
  return grid.lakeMask[i] ||
    (grid.channelStrength[i] > 0.02 && grid.waterPresence[i] > 0.001)
    ? 1
    : 0;
}

// Smooth bank profile. The nearest-cell footprint edge sits at t = 0.5, so the
// carve fades to zero exactly where the wet mask ends and the bank meets the
// dry terrain continuously instead of dropping `depth` metres in one step.
function shoreWeight(grid: HydrologyGrid, gx: number, gz: number): number {
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(HYDRO_N - 1, x0 + 1);
  const z1 = Math.min(HYDRO_N - 1, z0 + 1);
  const tx = gx - x0;
  const tz = gz - z0;
  const t = lerp(
    lerp(wetNode(grid, hydroIndex(x0, z0)), wetNode(grid, hydroIndex(x1, z0)), tx),
    lerp(wetNode(grid, hydroIndex(x0, z1)), wetNode(grid, hydroIndex(x1, z1)), tx),
    tz
  );
  const s = clamp((t - 0.5) * 2, 0, 1);
  return s * s * (3 - 2 * s);
}

// Pure hydrology lookup. Must never call terrainHeightAt(): the carve depends
// on it, and waterDepthAt depends on the carved terrain.
function waterColumnAt(x: number, z: number): WaterColumn | null {
  if (nearHome(x, z) || nearVillage(x, z)) return null;

  const grid = hydrologyGrid();
  const { gx, gz } = hydroCoords(x, z);
  const cell = hydrologyCellAt(x, z);

  if (grid.oceanMask[cell.i]) {
    return { surface: WATER_LEVEL, depth: 0, shore: 1, ocean: true };
  }

  // Nearest-cell classification stays authoritative (no leakage across dry
  // ridges); only scalar fields are interpolated inside the classified body.
  if (grid.lakeMask[cell.i]) {
    const surface = Math.max(WATER_LEVEL, bilinear(grid.filledElevation, gx, gz));
    const depth = bilinearWeighted(grid.waterDepth, grid.waterPresence, gx, gz);
    return {
      surface,
      depth: Math.min(Math.max(0, depth), Math.max(0, surface - 0.2)),
      shore: shoreWeight(grid, gx, gz),
      ocean: false,
    };
  }

  if (grid.channelStrength[cell.i] > 0.02 && grid.waterPresence[cell.i] > 0.001) {
    const surface = bilinearWeighted(grid.waterSurface, grid.waterPresence, gx, gz);
    const depth = bilinearWeighted(grid.waterDepth, grid.waterPresence, gx, gz);
    if (surface <= 0 || depth <= 0.001) return null;
    return {
      surface,
      depth: Math.min(depth, Math.max(0, surface - 0.2)),
      shore: shoreWeight(grid, gx, gz),
      ocean: false,
    };
  }

  return null;
}

function hydrologySampleAt(x: number, z: number): HydrologySample {
  const grid = hydrologyGrid();
  const { gx, gz } = hydroCoords(x, z);
  const cell = hydrologyCellAt(x, z);

  // Direction is a topological property of the drainage graph, not a
  // smoothly interpolated visual field. Interpolating vectors between adjacent
  // cells can point across a ridge at a watershed boundary.
  const flowVector = new THREE.Vector2(
    grid.flowDx[cell.i],
    grid.flowDz[cell.i]
  );
  if (flowVector.lengthSq() > 0.0001) flowVector.normalize();

  // Classification is authoritative at the nearest drainage cell. Only the
  // scalar fields are smoothed inside that already-classified water body.
  // This prevents bilinear interpolation from leaking a river/lake across a
  // dry ridge or island merely because a neighboring cell contains water.
  const cellIsLake = !!grid.lakeMask[cell.i];
  const cellIsOcean = !!grid.oceanMask[cell.i];
  const cellIsChannel = grid.channelStrength[cell.i] > 0.02;

  return {
    baseElevation: bilinear(grid.baseElevation, gx, gz),
    filledElevation: bilinear(grid.filledElevation, gx, gz),
    flowAccumulation: bilinear(grid.flowAccumulation, gx, gz),
    channelStrength: cellIsChannel
      ? bilinearWeighted(grid.channelStrength, grid.waterPresence, gx, gz)
      : 0,
    lake: cellIsLake,
    ocean: cellIsOcean,
    flowVector,
    flowDrop: grid.flowDrop[cell.i],
  };
}

function hydrologyCarveAt(x: number, z: number): number {
  const col = waterColumnAt(x, z);
  if (!col || col.ocean || col.depth <= 0.005) return 0;

  // Carve toward the same bed the water column describes, scaled by the shore
  // weight so the bank slopes down from the dry terrain instead of forming a
  // vertical wall at the wet-cell boundary.
  const bed = col.surface - col.depth;
  return col.shore * Math.max(0, terrainBaseHeightAt(x, z) - bed);
}

export function riverDistanceAt(x: number, z: number): number {
  if (nearHome(x, z) || nearVillage(x, z)) return 999;

  const sample = hydrologySampleAt(x, z);
  if (sample.lake || sample.ocean) return 999;
  if (sample.channelStrength > 0.03) return 0;

  const grid = hydrologyGrid();
  const { gx, gz } = hydroCoords(x, z);
  const cx = Math.round(gx);
  const cz = Math.round(gz);
  let best = 999;

  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const ix = cx + dx;
      const iz = cz + dz;
      if (ix < 0 || ix >= HYDRO_N || iz < 0 || iz >= HYDRO_N) continue;

      const strength = grid.channelStrength[hydroIndex(ix, iz)];
      if (strength < 0.20) continue;
      best = Math.min(best, Math.hypot(dx, dz) * HYDRO_RESOLUTION);
    }
  }

  return best;
}

export function isRiverAt(x: number, z: number, width = 7.5): boolean {
  const sample = hydrologySampleAt(x, z);
  if (sample.lake || sample.ocean) return false;
  return sample.channelStrength > 0.03 && riverDistanceAt(x, z) <= width;
}

export function lakeDepressionAt(x: number, z: number, _ground = 6.0): number {
  if (nearHome(x, z) || nearVillage(x, z)) return 0;
  return hydrologySampleAt(x, z).lake ? hydrologyCarveAt(x, z) : 0;
}

export function riverCarveAt(x: number, z: number, _ground = 6.0): number {
  if (nearHome(x, z) || nearVillage(x, z)) return 0;

  const sample = hydrologySampleAt(x, z);
  if (sample.lake || sample.ocean || sample.channelStrength <= 0.02) return 0;
  return hydrologyCarveAt(x, z);
}

// Legacy map/UI coordinates retained for compatibility. They no longer define
// water placement or shape.
export const LAKE_X = -85;
export const LAKE_Z = -65;
export const LAKE_RADIUS = 32;

export function waterFlowAt(x: number, z: number): {
  flowVector: THREE.Vector2;
  flowSpeed: number;
  flowAccumulation: number;
  waterType: WaterType;
  flowDrop: number;
} {
  const sample = hydrologySampleAt(x, z);
  const depth = waterDepthAt(x, z);

  if (depth <= 0.02) {
    return {
      flowVector: new THREE.Vector2(),
      flowSpeed: 0,
      flowAccumulation: 0,
      waterType: 'none',
      flowDrop: 0,
    };
  }

  if (sample.ocean) {
    return {
      flowVector: sample.flowVector,
      flowSpeed: 0.35,
      flowAccumulation: sample.flowAccumulation,
      waterType: 'ocean',
      flowDrop: sample.flowDrop,
    };
  }

  if (sample.lake) {
    return {
      // Lakes are reservoirs, not rivers. Wind creates surface motion/waves;
      // the drainage vector must not drag swimmers across a peaceful basin.
      flowVector: new THREE.Vector2(),
      flowSpeed: 0.02,
      flowAccumulation: sample.flowAccumulation,
      waterType: 'lake',
      flowDrop: 0,
    };
  }

  if (sample.channelStrength > 0.02) {
    let waterType: WaterType = 'stream';

    if (
      sample.flowAccumulation >= RIVER_RUNOFF_THRESHOLD ||
      sample.channelStrength > 0.58
    ) {
      waterType = 'river';
    } else if (
      sample.flowAccumulation < 78 &&
      sample.flowDrop < 2.6
    ) {
      // Springs are source-like headwaters, not simply steep points inside a
      // mature river. Large rivers can have waterfalls without being springs.
      waterType = 'spring';
    }

    const speed = clamp(
      0.5 +
      Math.sqrt(Math.max(0, sample.flowDrop)) * 0.9 +
      Math.log1p(sample.flowAccumulation) * 0.09 +
      sample.channelStrength * 1.45,
      0.5,
      5.8
    );

    return {
      flowVector: sample.flowVector,
      flowSpeed: speed,
      flowAccumulation: sample.flowAccumulation,
      waterType,
      flowDrop: sample.flowDrop,
    };
  }

  return {
    flowVector: new THREE.Vector2(),
    flowSpeed: 0.08,
    flowAccumulation: 0,
    waterType: 'wetland',
    flowDrop: 0,
  };
}

// ============================================================================
// 3. ELEVATION FIELD & TOPOGRAPHY
// ============================================================================

export function geologicalBasinDepressionAt(x: number, z: number): number {
  // These are geological depressions; the hydrology solver decides whether
  // they become lakes.
  const basins = [
    { x: -85, z: -65, radius: 44, depth: 6.2 },
    { x: 150, z: 58, radius: 30, depth: 3.8 },
  ];

  let depression = 0;
  for (const basin of basins) {
    const d = Math.hypot(x - basin.x, z - basin.z);
    if (d >= basin.radius) continue;

    const t = 1 - d / basin.radius;
    const smooth = t * t * (3 - 2 * t);
    depression = Math.max(depression, smooth * basin.depth);
  }

  // Broad continental shelf: the playable land naturally meets open ocean
  // instead of ending in a vertical square-world wall.
  const radial = Math.hypot(x, z);
  const coastT = clamp((radial - 242) / 78, 0, 1);
  // Deeper outer shelf creates a continuous ocean moat around the finite playable island.
  // The interior stays untouched; shoreline ramps down gradually instead of ending in a wall.
  const shelf = coastT * coastT * (3 - 2 * coastT) * 9.0;

  return depression + shelf;
}

export function rawTerrainHeightAt(x: number, z: number): number {
  const broad = Math.sin(x * 0.015) * 1.8 + Math.cos(z * 0.018) * 1.5;
  const hills = Math.sin((x + z) * 0.038) * 0.95 + Math.cos((x - z) * 0.028) * 0.75;
  const mtn = mountainStructureAt(x, z);

  return broad + hills + 5.2 + mtn.elevation - geologicalBasinDepressionAt(x, z);
}

function terrainBaseHeightAt(x: number, z: number): number {
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

  return Math.max(0.2, ground);
}

export function terrainHeightAt(x: number, z: number): number {
  return Math.max(0.2, terrainBaseHeightAt(x, z) - hydrologyCarveAt(x, z));
}

export function waterSurfaceAt(x: number, z: number): number {
  if (nearHome(x, z) || nearVillage(x, z)) return WATER_LEVEL;
  return waterColumnAt(x, z)?.surface ?? WATER_LEVEL;
}

export function waterDepthAt(x: number, z: number): number {
  const col = waterColumnAt(x, z);
  if (!col) return 0;

  if (col.ocean) {
    return Math.max(0, WATER_LEVEL - terrainBaseHeightAt(x, z));
  }

  // Depth is measured against the SAME carved terrain the mesh, colouring and
  // player collision use, so water exists exactly where that ground is below
  // the surface and tapers to zero at the shoreline.
  return Math.max(0, col.surface - terrainHeightAt(x, z) - SHORE_EPS);
}

export function waterAt(x: number, z: number): boolean {
  if (nearHome(x, z)) return false;
  return waterDepthAt(x, z) > 0.02;
}

export function snowDepthAt(x: number, z: number): number {
  const elevation = terrainHeightAt(x, z);
  if (waterAt(x, z)) return 0;

  const temperature = 23.0 - elevation * 0.42;
  const precipitation = hydrologyRainfallAt(x, z);
  const freezeFactor = clamp((2.0 - temperature) / 7.5, 0, 1);
  const highAlpine = clamp((elevation - 34.0) / 24.0, 0, 1);
  return clamp(
    freezeFactor * (0.30 + precipitation * 0.70) * 0.82 +
    highAlpine * 0.35,
    0,
    1
  );
}

export function iceThicknessAt(x: number, z: number): number {
  const depth = waterDepthAt(x, z);
  if (depth <= 0.25) return 0;

  const elevation = terrainHeightAt(x, z);
  const temperature = 23.0 - elevation * 0.42;
  const sample = hydrologySampleAt(x, z);

  if (!sample.lake || temperature > -2.0) return 0;
  return clamp((-temperature - 1.5) / 10.0, 0, 1) * clamp(depth / 2.0, 0.2, 1);
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
  const hydro = hydrologySampleAt(x, z);
  const nearWaterBonus = wDepth > 0 ? 0.3 : hydro.channelStrength > 0.08 ? 0.2 : 0;
  const humidity = clamp(rainfall * 0.75 + nearWaterBonus + (temperature < 5 ? 0.15 : 0), 0.1, 1.0);

  // 4. Soil Moisture: depends on rainfall, drainage slope, and water bodies
  // Steep rocky slopes drain immediately; valleys and lake margins hold moisture
  const slopeDrainage = Math.cos(slopeInfo.slope); // 1 on flat, 0 on cliff
  const riverHydration = hydro.channelStrength * 0.5;
  const basinHydration = hydro.lake ? 0.55 : hydro.ocean ? 0.35 : 0;

  const soilMoisture = clamp(
    rainfall * 0.5 * slopeDrainage + riverHydration + basinHydration + (wDepth > 0 ? 0.4 : 0),
    0.05,
    1.0
  );

  return { temperature, rainfall, humidity, soilMoisture };
}

// ============================================================================
// 5. WATER FLOW API
// ============================================================================
//
// waterFlowAt() is implemented with the drainage grid in section 2. Keeping
// the section marker here preserves the existing module organization without
// maintaining a second, spline-based water system.

// ============================================================================
// 6. MASTER WORLD FIELD QUERY
// ============================================================================

export function queryWorldFields(x: number, z: number): WorldFields {
  const elev = terrainHeightAt(x, z);
  const slopeInfo = terrainSlopeAt(x, z);
  const mtn = mountainStructureAt(x, z);
  const climate = climateFieldsAt(x, z);
  const flow = waterFlowAt(x, z);
  const snowDepth = snowDepthAt(x, z);
  const iceThickness = iceThicknessAt(x, z);

  // Landform classification
  let landform: Landform = 'plains';
  if (flow.waterType === 'ocean') landform = 'ocean';
  else if (flow.waterType === 'lake') landform = 'basin';
  else if (flow.waterType === 'river' || flow.waterType === 'stream' || flow.waterType === 'spring') landform = 'valley';
  else if (flow.waterType === 'wetland') landform = 'wetland';
  else if (mtn.mask > 0.7 && elev > 48.0) landform = 'peak';
  else if (mtn.mask > 0.5 && elev > 32.0) landform = 'mountain_ridge';
  else if (mtn.style === 'plateau' && elev > 30.0 && slopeInfo.slope < 0.25) landform = 'plateau';
  else if (mtn.mask > 0.25) landform = 'mountain_slope';
  else if (elev > 14.0) landform = 'foothills';
  else if (slopeInfo.slope > 0.3) landform = 'hills';

  // Biome determination
  let biome: Biome = 'meadow';
  if (flow.waterType === 'river' || flow.waterType === 'stream' || flow.waterType === 'spring') {
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
    flowDrop: flow.flowDrop,
    snowDepth,
    iceThickness,
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
  private readonly offsetX: number;
  private readonly offsetZ: number;

  constructor(seed: number = SEED) {
    this.seed = seed;

    // The global terrain functions intentionally remain backward-compatible
    // with the default world. Non-default WorldModel instances get a stable
    // coordinate offset, making the seed a real world selector rather than a
    // decorative constructor argument.
    if (seed === SEED) {
      this.offsetX = 0;
      this.offsetZ = 0;
    } else {
      let n = Math.imul(seed | 0, 0x45d9f3b);
      n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
      n ^= n >>> 16;
      this.offsetX = ((n >>> 0) % 2048) - 1024;
      this.offsetZ = (((Math.imul(n ^ 0x9e3779b9, 0x27d4eb2d) >>> 0) % 2048) - 1024);
    }
  }

  private worldX(x: number): number {
    return x + this.offsetX;
  }

  private worldZ(z: number): number {
    return z + this.offsetZ;
  }

  /** Base Geological Layer 1: Deterministic Elevation (m) */
  getElevation(x: number, z: number): number {
    return terrainHeightAt(this.worldX(x), this.worldZ(z));
  }

  /** Base Geological Layer 2: Deterministic Slope & Normal */
  getSlope(x: number, z: number, delta = 0.8): { slope: number; normal: THREE.Vector3 } {
    return terrainSlopeAt(this.worldX(x), this.worldZ(z), delta);
  }

  /** Base Geological Layer 3: Deterministic Soil Moisture [0, 1] */
  getMoisture(x: number, z: number): number {
    return climateFieldsAt(this.worldX(x), this.worldZ(z)).soilMoisture;
  }

  /** Base Geological Layer 4: Deterministic Temperature (°C) */
  getTemperature(x: number, z: number): number {
    return climateFieldsAt(this.worldX(x), this.worldZ(z)).temperature;
  }

  /** Sample the 4 primary geological layers simultaneously */
  getGeologicalLayers(x: number, z: number, delta = 0.8): GeologicalLayers {
    const wx = this.worldX(x);
    const wz = this.worldZ(z);
    const elevation = terrainHeightAt(wx, wz);
    const { slope, normal: slopeNormal } = terrainSlopeAt(wx, wz, delta);
    const climate = climateFieldsAt(wx, wz);
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
    return queryWorldFields(this.worldX(x), this.worldZ(z));
  }

  /** Water depth at coordinate */
  getWaterDepth(x: number, z: number): number {
    return waterDepthAt(this.worldX(x), this.worldZ(z));
  }

  /** True if point is submerged in water */
  hasWater(x: number, z: number): boolean {
    return waterAt(this.worldX(x), this.worldZ(z));
  }

  /** Downstream water flow vector and speed */
  getWaterFlow(x: number, z: number) {
    return waterFlowAt(this.worldX(x), this.worldZ(z));
  }

  getWaterSurface(x: number, z: number): number {
    return waterSurfaceAt(this.worldX(x), this.worldZ(z));
  }

  getSnowDepth(x: number, z: number): number {
    return snowDepthAt(this.worldX(x), this.worldZ(z));
  }

  getIceThickness(x: number, z: number): number {
    return iceThicknessAt(this.worldX(x), this.worldZ(z));
  }

  /** Biome classification at coordinate */
  getBiome(x: number, z: number): Biome {
    return biomeAt(this.worldX(x), this.worldZ(z));
  }
}

export const defaultWorldModel = new WorldModel(SEED);
