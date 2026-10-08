import * as THREE from 'three';
import {
  WORLD_RADIUS,
  SIZE,
  terrainHeightAt,
  waterDepthAt,
  waterSurfaceAt,
  snowDepthAt,
  mountainMaskAt,
} from './world';

/**
 * Voxel world foundation.
 *
 * The large-scale world remains generated from the deterministic geological
 * + hydrological field. Voxels are the physical representation layer:
 * every world coordinate has a solid/air/water material at each integer Y.
 *
 * The base volume is procedural and therefore does not need to be stored.
 * Player edits are sparse overrides, which keeps memory practical on mobile.
 */

export const VOXEL_SIZE = 1;
export const VOXEL_MIN_Y = 0;
export const VOXEL_MAX_Y = 112;
export const VOXEL_HEIGHT = VOXEL_MAX_Y - VOXEL_MIN_Y + 1;

export enum VoxelMaterial {
  AIR = 0,
  GRASS = 1,
  TOPSOIL = 2,
  LOAM = 3,
  CLAY = 4,
  SAND = 5,
  GRAVEL = 6,
  WEATHERED_ROCK = 7,
  STONE = 8,
  GRANITE = 9,
  SHALE = 10,
  BEDROCK = 11,
  SNOW = 12,
  ICE = 13,
  WATER = 14,
}

const materialColors: Record<VoxelMaterial, THREE.Color> = {
  [VoxelMaterial.AIR]: new THREE.Color(0x000000),
  [VoxelMaterial.GRASS]: new THREE.Color(0x6b9655),
  [VoxelMaterial.TOPSOIL]: new THREE.Color(0x382618),
  [VoxelMaterial.LOAM]: new THREE.Color(0x4a3424),
  [VoxelMaterial.CLAY]: new THREE.Color(0x7c492e),
  [VoxelMaterial.SAND]: new THREE.Color(0xd6c290),
  [VoxelMaterial.GRAVEL]: new THREE.Color(0x6b675d),
  [VoxelMaterial.WEATHERED_ROCK]: new THREE.Color(0x5d5e5f),
  [VoxelMaterial.STONE]: new THREE.Color(0x4b4d50),
  [VoxelMaterial.GRANITE]: new THREE.Color(0x727376),
  [VoxelMaterial.SHALE]: new THREE.Color(0x2d3035),
  [VoxelMaterial.BEDROCK]: new THREE.Color(0x222326),
  [VoxelMaterial.SNOW]: new THREE.Color(0xf7f9fc),
  [VoxelMaterial.ICE]: new THREE.Color(0x9edbe8),
  [VoxelMaterial.WATER]: new THREE.Color(0x247d9c),
};

export function voxelMaterialColor(material: VoxelMaterial): THREE.Color {
  return materialColors[material].clone();
}

export function isSolidVoxel(material: VoxelMaterial): boolean {
  return material !== VoxelMaterial.AIR && material !== VoxelMaterial.WATER;
}

export function isLiquidVoxel(material: VoxelMaterial): boolean {
  return material === VoxelMaterial.WATER || material === VoxelMaterial.ICE;
}

function localIndex(lx: number, y: number, lz: number): number {
  return lz * SIZE + lx + (y - VOXEL_MIN_Y) * SIZE * SIZE;
}

function baseMaterialAt(x: number, y: number, z: number): VoxelMaterial {
  if (y < VOXEL_MIN_Y || y > VOXEL_MAX_Y) return VoxelMaterial.AIR;

  const terrainY = terrainHeightAt(x + 0.5, z + 0.5);
  const topBlock = Math.floor(terrainY);

  // Water is a real volume above the carved bed, not just a blue surface.
  const depth = waterDepthAt(x + 0.5, z + 0.5);
  if (depth > 0.02) {
    const surfaceY = waterSurfaceAt(x + 0.5, z + 0.5);
    if (y > topBlock && y + 1 <= surfaceY + 0.001) {
      return VoxelMaterial.WATER;
    }
  }

  if (y > topBlock) return VoxelMaterial.AIR;

  const depthFromSurface = topBlock - y;
  const mountain = mountainMaskAt(x + 0.5, z + 0.5);
  const snow = snowDepthAt(x + 0.5, z + 0.5);

  if (y === VOXEL_MIN_Y) return VoxelMaterial.BEDROCK;

  if (depthFromSurface === 0) {
    if (snow > 0.45) return VoxelMaterial.SNOW;
    if (depth > 0.02) return VoxelMaterial.GRAVEL;
    if (mountain > 0.65 || terrainY > 32) return VoxelMaterial.STONE;
    return VoxelMaterial.GRASS;
  }

  // Different environments naturally expose different sediment layers.
  if (depthFromSurface <= 1) {
    if (depth > 0.02) return VoxelMaterial.GRAVEL;
    return VoxelMaterial.TOPSOIL;
  }

  if (depthFromSurface <= 3) {
    if (depth > 0.02) return VoxelMaterial.SAND;
    return VoxelMaterial.LOAM;
  }

  if (depthFromSurface <= 7) return VoxelMaterial.CLAY;
  if (depthFromSurface <= 15) {
    return mountain > 0.55 ? VoxelMaterial.GRANITE : VoxelMaterial.WEATHERED_ROCK;
  }
  if (mountain > 0.7) return VoxelMaterial.GRANITE;
  if (mountain > 0.35) return VoxelMaterial.SHALE;
  return VoxelMaterial.STONE;
}

export interface VoxelEdit {
  x: number;
  y: number;
  z: number;
  material: VoxelMaterial;
}

export class VoxelChunk {
  readonly cx: number;
  readonly cz: number;

  // Only mutations are stored. Unedited cells come from deterministic base
  // generation, making the voxel layer cheap to keep resident.
  private readonly edits = new Map<number, VoxelMaterial>();

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
  }

  private key(lx: number, y: number, lz: number): number {
    return localIndex(lx, y, lz);
  }

  getLocal(lx: number, y: number, lz: number): VoxelMaterial {
    if (lx < 0 || lx >= SIZE || lz < 0 || lz >= SIZE || y < VOXEL_MIN_Y || y > VOXEL_MAX_Y) {
      return VoxelMaterial.AIR;
    }

    const key = this.key(lx, y, lz);
    const edited = this.edits.get(key);
    if (edited !== undefined) return edited;

    return baseMaterialAt(
      this.cx * SIZE + lx,
      y,
      this.cz * SIZE + lz,
    );
  }

  setLocal(lx: number, y: number, lz: number, material: VoxelMaterial): void {
    if (lx < 0 || lx >= SIZE || lz < 0 || lz >= SIZE || y < VOXEL_MIN_Y || y > VOXEL_MAX_Y) return;

    const key = this.key(lx, y, lz);
    const base = baseMaterialAt(this.cx * SIZE + lx, y, this.cz * SIZE + lz);

    if (material === base) this.edits.delete(key);
    else this.edits.set(key, material);
  }

  editsArray(): VoxelEdit[] {
    const result: VoxelEdit[] = [];
    for (const [key, material] of this.edits) {
      const yIndex = Math.floor(key / (SIZE * SIZE));
      const rest = key - yIndex * SIZE * SIZE;
      const lz = Math.floor(rest / SIZE);
      const lx = rest - lz * SIZE;
      result.push({
        x: this.cx * SIZE + lx,
        y: VOXEL_MIN_Y + yIndex,
        z: this.cz * SIZE + lz,
        material,
      });
    }
    return result;
  }

  clearEdits(): void {
    this.edits.clear();
  }
}

export class VoxelWorld {
  private readonly chunks = new Map<string, VoxelChunk>();

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  chunk(cx: number, cz: number): VoxelChunk {
    const key = this.key(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new VoxelChunk(cx, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  get(x: number, y: number, z: number): VoxelMaterial {
    const cx = Math.floor(x / SIZE);
    const cz = Math.floor(z / SIZE);
    const lx = x - cx * SIZE;
    const lz = z - cz * SIZE;
    return this.chunk(cx, cz).getLocal(lx, y, lz);
  }

  set(x: number, y: number, z: number, material: VoxelMaterial): void {
    const cx = Math.floor(x / SIZE);
    const cz = Math.floor(z / SIZE);
    this.chunk(cx, cz).setLocal(x - cx * SIZE, y, z - cz * SIZE, material);
  }

  /** Height of the top solid block in the deterministic voxel column. */
  groundVoxelTop(x: number, z: number): number {
    return Math.floor(terrainHeightAt(x + 0.5, z + 0.5)) + 1;
  }

  /** Floating-point position just above the top voxel, for future voxel physics. */
  groundHeight(x: number, z: number): number {
    return this.groundVoxelTop(Math.floor(x), Math.floor(z));
  }

  edits(): VoxelEdit[] {
    const result: VoxelEdit[] = [];
    for (const chunk of this.chunks.values()) result.push(...chunk.editsArray());
    return result;
  }

  applyEdits(edits: VoxelEdit[]): void {
    for (const edit of edits) this.set(edit.x, edit.y, edit.z, edit.material);
  }

  clear(): void {
    for (const chunk of this.chunks.values()) chunk.clearEdits();
  }
}

export const voxelWorld = new VoxelWorld();

export function voxelWorldBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  // Chunk indices -WORLD_RADIUS..WORLD_RADIUS cover this exact asymmetric
  // interval because chunk coordinates use floor(x / SIZE).
  return {
    minX: -WORLD_RADIUS * SIZE,
    maxX: (WORLD_RADIUS + 1) * SIZE,
    minZ: -WORLD_RADIUS * SIZE,
    maxZ: (WORLD_RADIUS + 1) * SIZE,
  };
}

function addQuad(
  positions: number[],
  colors: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  materialId: VoxelMaterial,
): void {
  const color = voxelMaterialColor(materialId);
  for (const v of [a, b, c, a, c, d]) {
    positions.push(v.x, v.y, v.z);
    colors.push(color.r, color.g, color.b);
  }
}

function addStratifiedVerticalFace(
  positions: number[],
  colors: number[],
  topX: number,
  topZ: number,
  lowHeight: number,
  highHeight: number,
  axis: 'x' | 'z',
  side: 1 | -1,
): void {
  const y0 = Math.max(VOXEL_MIN_Y, lowHeight);
  const y1 = Math.min(VOXEL_MAX_Y + 1, highHeight);
  if (y1 - y0 <= 0.05) return;

  // Split long exposed faces into material bands so a side-on survey can
  // actually see topsoil/loam/clay/rock rather than one uniform wall.
  let cursor = y0;
  const maxBandHeight = 4;
  while (cursor < y1 - 0.01) {
    const next = Math.min(y1, cursor + maxBandHeight);
    const materialY = Math.min(highHeight - 0.01, (cursor + next) * 0.5);
    const materialId = baseMaterialAt(topX, Math.floor(materialY), topZ);

    if (axis === 'x') {
      const z0 = topZ;
      const z1 = topZ + side * VOXEL_SIZE * 4;
      addQuad(
        positions,
        colors,
        new THREE.Vector3(topX, cursor, z0),
        new THREE.Vector3(topX, cursor, z1),
        new THREE.Vector3(topX, next, z1),
        new THREE.Vector3(topX, next, z0),
        materialId,
      );
    } else {
      const x0 = topX;
      const x1 = topX + side * VOXEL_SIZE * 4;
      addQuad(
        positions,
        colors,
        new THREE.Vector3(x0, cursor, topZ),
        new THREE.Vector3(x1, cursor, topZ),
        new THREE.Vector3(x1, next, topZ),
        new THREE.Vector3(x0, next, topZ),
        materialId,
      );
    }

    cursor = next;
  }
}

/**
 * Build a low-resolution but genuinely volumetric geological shell.
 *
 * The gameplay surface is still the existing high-quality continuous terrain.
 * This mesh supplies the previously missing vertical material volume for the
 * WORLD survey, especially when the camera is lifted to a side-on view.
 *
 * A 4 m sampling interval keeps it cheap enough for a one-time survey pass.
 * Interior faces are omitted; only exposed height differences and the finite
 * world rim are represented.
 */
export function buildVoxelWorldVolumeMesh(material: THREE.Material): THREE.Mesh | null {
  const bounds = voxelWorldBounds();
  const sampleStep = 4;
  const nx = Math.floor((bounds.maxX - bounds.minX) / sampleStep);
  const nz = Math.floor((bounds.maxZ - bounds.minZ) / sampleStep);
  const heights = new Float32Array((nx + 1) * (nz + 1));

  const index = (ix: number, iz: number) => iz * (nx + 1) + ix;
  const sampleX = (ix: number) => bounds.minX + ix * sampleStep;
  const sampleZ = (iz: number) => bounds.minZ + iz * sampleStep;

  for (let iz = 0; iz <= nz; iz++) {
    for (let ix = 0; ix <= nx; ix++) {
      heights[index(ix, iz)] = Math.max(
        0.2,
        terrainHeightAt(sampleX(ix), sampleZ(iz)),
      );
    }
  }

  const positions: number[] = [];
  const colors: number[] = [];

  // Exposed vertical faces where a higher column meets a lower one.
  for (let iz = 0; iz <= nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = heights[index(ix, iz)];
      const b = heights[index(ix + 1, iz)];
      if (Math.abs(a - b) < 0.6) continue;

      if (a > b) {
        addStratifiedVerticalFace(
          positions, colors,
          sampleX(ix), sampleZ(iz),
          b, a,
          'x',
          -1,
        );
      } else {
        addStratifiedVerticalFace(
          positions, colors,
          sampleX(ix + 1), sampleZ(iz),
          a, b,
          'x',
          1,
        );
      }
    }
  }

  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix <= nx; ix++) {
      const a = heights[index(ix, iz)];
      const b = heights[index(ix, iz + 1)];
      if (Math.abs(a - b) < 0.6) continue;

      if (a > b) {
        addStratifiedVerticalFace(
          positions, colors,
          sampleX(ix), sampleZ(iz),
          b, a,
          'z',
          -1,
        );
      } else {
        addStratifiedVerticalFace(
          positions, colors,
          sampleX(ix), sampleZ(iz + 1),
          a, b,
          'z',
          1,
        );
      }
    }
  }

  // Finite-world rim: the ground is not paper-thin at the playable boundary.
  for (let ix = 0; ix < nx; ix++) {
    const x = sampleX(ix);
    const xNext = sampleX(ix + 1);
    const south = heights[index(ix, 0)];
    const southNext = heights[index(ix + 1, 0)];
    const southH = Math.max(south, southNext);
    addStratifiedVerticalFace(positions, colors, x, bounds.minZ, 0, southH, 'z', -1);

    const north = heights[index(ix, nz)];
    const northNext = heights[index(ix + 1, nz)];
    const northH = Math.max(north, northNext);
    addStratifiedVerticalFace(positions, colors, x, bounds.maxZ, 0, northH, 'z', 1);
  }

  for (let iz = 0; iz < nz; iz++) {
    const z = sampleZ(iz);
    const zNext = sampleZ(iz + 1);
    const west = heights[index(0, iz)];
    const westNext = heights[index(0, iz + 1)];
    const westH = Math.max(west, westNext);
    addStratifiedVerticalFace(positions, colors, bounds.minX, z, 0, westH, 'x', -1);

    const east = heights[index(nx, iz)];
    const eastNext = heights[index(nx, iz + 1)];
    const eastH = Math.max(east, eastNext);
    addStratifiedVerticalFace(positions, colors, bounds.maxX, z, 0, eastH, 'x', 1);
  }

  if (!positions.length) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'voxel-world-volume';
  mesh.frustumCulled = true;
  return mesh;
}
