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

export function voxelWorldBounds(): { min: number; max: number } {
  const half = (WORLD_RADIUS * 2 + 1) * SIZE * 0.5;
  return { min: -half, max: half };
}

/**
 * Build a lightweight geological cutaway along the finite world's outer rim.
 *
 * It is intentionally created as a survey/development aid first. The gameplay
 * terrain remains the efficient continuous surface while the actual voxel
 * volume is available underneath for the later editable terrain pass.
 */
export function buildVoxelBoundaryShell(
  material: THREE.Material,
  cx: number,
  cz: number,
): THREE.Mesh | null {
  if (
    Math.abs(cx) !== WORLD_RADIUS &&
    Math.abs(cz) !== WORLD_RADIUS
  ) return null;

  const min = voxelWorldBounds().min;
  const max = voxelWorldBounds().max;
  const faces: number[] = [];
  const colors: number[] = [];

  const addFace = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    materialId: VoxelMaterial,
  ) => {
    const color = voxelMaterialColor(materialId);
    for (const v of [a, b, c, a, c, d]) {
      faces.push(v.x, v.y, v.z);
      colors.push(color.r, color.g, color.b);
    }
  };

  // One metre vertical strata on the exterior boundary makes the finite world
  // a visible solid rather than a paper-thin sheet when the camera is lifted.
  const samples = SIZE;
  const step = SIZE / samples;
  const addRim = (along: number, sideX: boolean) => {
    const p = sideX
      ? { x: along, z: along >= 0 ? max : min }
      : { x: along >= 0 ? max : min, z: along };

    const h = terrainHeightAt(p.x, p.z);
    const top = Math.max(0.2, h);
    for (let y = VOXEL_MIN_Y; y < Math.floor(top); y++) {
      const matId = y === 0
        ? VoxelMaterial.BEDROCK
        : baseMaterialAt(p.x, y, p.z);
      const y1 = y;
      const y2 = y + 1;
      if (sideX) {
        const z = p.z;
        const nx = p.x;
        addFace(
          new THREE.Vector3(nx, y1, z),
          new THREE.Vector3(nx, y1, z + (z === max ? step : -step)),
          new THREE.Vector3(nx, y2, z + (z === max ? step : -step)),
          new THREE.Vector3(nx, y2, z),
          matId,
        );
      } else {
        const x = p.x;
        const nz = p.z;
        addFace(
          new THREE.Vector3(x, y1, nz),
          new THREE.Vector3(x + (x === max ? step : -step), y1, nz),
          new THREE.Vector3(x + (x === max ? step : -step), y2, nz),
          new THREE.Vector3(x, y2, nz),
          matId,
        );
      }
    }
  };

  // Sample across the entire rim only; interior chunks remain untouched so this
  // has negligible gameplay cost and is mainly visible in full-world survey.
  for (let i = 0; i <= WORLD_RADIUS * 2; i++) {
    const along = min + i * SIZE;
    addRim(along, true);
    addRim(along, false);
  }

  if (!faces.length) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'voxel-boundary-shell';
  mesh.renderOrder = 0;
  return mesh;
}
