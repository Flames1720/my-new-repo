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

  /**
   * Remove a spherical group of solid voxels. This is intentionally a data-layer
   * operation; rendering/collision remeshing will be wired to it in the next
   * milestone so edits never have to modify the global terrain formula.
   */
  digSphere(x: number, y: number, z: number, radius = 1): number {
    const r = Math.max(0.5, radius);
    const minX = Math.floor(x - r);
    const maxX = Math.floor(x + r);
    const minY = Math.max(VOXEL_MIN_Y, Math.floor(y - r));
    const maxY = Math.min(VOXEL_MAX_Y, Math.floor(y + r));
    const minZ = Math.floor(z - r);
    const maxZ = Math.floor(z + r);
    let removed = 0;

    for (let wz = minZ; wz <= maxZ; wz++) {
      for (let wy = minY; wy <= maxY; wy++) {
        for (let wx = minX; wx <= maxX; wx++) {
          const dx = wx + 0.5 - x;
          const dy = wy + 0.5 - y;
          const dz = wz + 0.5 - z;
          if (dx * dx + dy * dy + dz * dz > r * r) continue;

          const material = this.get(wx, wy, wz);
          if (!isSolidVoxel(material)) continue;
          this.set(wx, wy, wz, VoxelMaterial.AIR);
          removed++;
        }
      }
    }

    return removed;
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

function addTerrainQuad(
  positions: number[],
  colors: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  x: number,
  z: number,
): void {
  // Keep the top surface visually compatible with the existing world while
  // the side walls expose the actual material stack below it.
  const terrainY = (a.y + b.y + c.y + d.y) * 0.25;
  const mountain = mountainMaskAt(x, z);
  const water = waterDepthAt(x, z) > 0.02;
  const snow = snowDepthAt(x, z);
  const h = terrainY;
  const baseColor = voxelMaterialColor(
    snow > 0.45 ? VoxelMaterial.SNOW :
    water ? VoxelMaterial.GRAVEL :
    mountain > 0.65 || h > 32 ? VoxelMaterial.STONE :
    VoxelMaterial.GRASS
  );
  for (const v of [a, b, c, a, c, d]) {
    positions.push(v.x, v.y, v.z);
    colors.push(baseColor.r, baseColor.g, baseColor.b);
  }
}

function materialForExposedLayer(depthFromSurface: number, terrainY: number, x: number, z: number): VoxelMaterial {
  const mountain = mountainMaskAt(x, z);
  const water = waterDepthAt(x, z) > 0.02;
  const snow = snowDepthAt(x, z);

  if (depthFromSurface <= 1) {
    if (snow > 0.45 && terrainY > 28) return VoxelMaterial.SNOW;
    if (water) return VoxelMaterial.GRAVEL;
    if (terrainY > 32 || mountain > 0.65) return VoxelMaterial.STONE;
    return VoxelMaterial.GRASS;
  }
  if (depthFromSurface <= 3) return water ? VoxelMaterial.SAND : VoxelMaterial.LOAM;
  if (depthFromSurface <= 7) return VoxelMaterial.CLAY;
  if (depthFromSurface <= 15) {
    return mountain > 0.55 ? VoxelMaterial.GRANITE : VoxelMaterial.WEATHERED_ROCK;
  }
  if (mountain > 0.7) return VoxelMaterial.GRANITE;
  if (mountain > 0.35) return VoxelMaterial.SHALE;
  return VoxelMaterial.STONE;
}

function addStratifiedFace(
  positions: number[],
  colors: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  lowHeight: number,
  highHeight: number,
  x: number,
  z: number,
): void {
  const y0 = Math.max(VOXEL_MIN_Y, lowHeight);
  const y1 = Math.min(VOXEL_MAX_Y + 1, highHeight);
  if (y1 <= y0 + 0.01) return;

  // One-meter geological bands are intentionally visible in survey mode.
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    const band0 = Math.max(y0, y);
    const band1 = Math.min(y1, y + 1);
    if (band1 <= band0 + 0.01) continue;

    const center = (band0 + band1) * 0.5;
    const material = y <= VOXEL_MIN_Y ? VoxelMaterial.BEDROCK :
      materialForExposedLayer(Math.max(0, highHeight - center), highHeight, x, z);

    const aa = a.clone(); aa.y = band0;
    const bb = b.clone(); bb.y = band0;
    const cc = b.clone(); cc.y = band1;
    const dd = a.clone(); dd.y = band1;
    addQuad(positions, colors, aa, bb, cc, dd, material);
  }
}

/**
 * Build the actual survey terrain volume.
 *
 * This is no longer just a few decorative cliff strips. It is a closed
 * top+side volume down to the geological base, with one-meter stratified
 * exposed bands. The original terrain function still defines the topography;
 * this renderer makes the solid beneath that topography visible.
 */
export function buildVoxelWorldVolumeMesh(_material?: THREE.Material): THREE.Mesh | null {
  const bounds = voxelWorldBounds();
  const sampleStep = 2;
  const nx = Math.ceil((bounds.maxX - bounds.minX) / sampleStep);
  const nz = Math.ceil((bounds.maxZ - bounds.minZ) / sampleStep);
  const colsX = nx + 1;
  const colsZ = nz + 1;
  const heights = new Float32Array(colsX * colsZ);
  const positions: number[] = [];
  const colors: number[] = [];

  const index = (ix: number, iz: number) => iz * colsX + ix;
  const sampleX = (ix: number) => Math.min(bounds.maxX, bounds.minX + ix * sampleStep);
  const sampleZ = (iz: number) => Math.min(bounds.maxZ, bounds.minZ + iz * sampleStep);

  for (let iz = 0; iz < colsZ; iz++) {
    for (let ix = 0; ix < colsX; ix++) {
      const x = sampleX(ix);
      const z = sampleZ(iz);
      heights[index(ix, iz)] = Math.max(0.2, terrainHeightAt(x, z));
    }
  }

  // Top surface: one connected coarse voxel-compatible surface.
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x0 = sampleX(ix), x1 = sampleX(ix + 1);
      const z0 = sampleZ(iz), z1 = sampleZ(iz + 1);
      const h00 = heights[index(ix, iz)];
      const h10 = heights[index(ix + 1, iz)];
      const h01 = heights[index(ix, iz + 1)];
      const h11 = heights[index(ix + 1, iz + 1)];
      addTerrainQuad(
        positions, colors,
        new THREE.Vector3(x0, h00, z0),
        new THREE.Vector3(x0, h01, z1),
        new THREE.Vector3(x1, h11, z1),
        new THREE.Vector3(x1, h10, z0),
        (x0 + x1) * 0.5,
        (z0 + z1) * 0.5,
      );
    }
  }

  // Exposed internal faces where neighboring terrain columns differ enough to
  // reveal a real vertical geological wall rather than an invisible underside.
  for (let iz = 0; iz < colsZ; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = heights[index(ix, iz)];
      const b = heights[index(ix + 1, iz)];
      if (Math.abs(a - b) < 0.55) continue;

      const x = sampleX(ix + (a > b ? 1 : 0));
      const z = sampleZ(iz);
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      const z0 = z;
      const z1 = Math.min(bounds.maxZ, z + sampleStep);
      addStratifiedFace(
        positions, colors,
        new THREE.Vector3(x, low, z0),
        new THREE.Vector3(x, low, z1),
        low, high,
        x, (z0 + z1) * 0.5,
      );
    }
  }

  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < colsX; ix++) {
      const a = heights[index(ix, iz)];
      const b = heights[index(ix, iz + 1)];
      if (Math.abs(a - b) < 0.55) continue;

      const x = sampleX(ix);
      const z = sampleZ(iz + (a > b ? 1 : 0));
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      const x1 = Math.min(bounds.maxX, x + sampleStep);
      addStratifiedFace(
        positions, colors,
        new THREE.Vector3(x, low, z),
        new THREE.Vector3(x1, low, z),
        low, high,
        (x + x1) * 0.5, z,
      );
    }
  }

  // The finite world has a genuine vertical outer wall rather than a paper-thin
  // terrain edge. This is the clearest place to inspect the soil/rock sequence.
  for (let ix = 0; ix < nx; ix++) {
    const x0 = sampleX(ix), x1 = sampleX(ix + 1);
    const south = Math.max(heights[index(ix, 0)], heights[index(ix + 1, 0)]);
    const north = Math.max(heights[index(ix, nz)], heights[index(ix + 1, nz)]);
    addStratifiedFace(
      positions, colors,
      new THREE.Vector3(x0, 0, bounds.minZ),
      new THREE.Vector3(x1, 0, bounds.minZ),
      0, south,
      (x0 + x1) * 0.5, bounds.minZ,
    );
    addStratifiedFace(
      positions, colors,
      new THREE.Vector3(x0, 0, bounds.maxZ),
      new THREE.Vector3(x1, 0, bounds.maxZ),
      0, north,
      (x0 + x1) * 0.5, bounds.maxZ,
    );
  }

  for (let iz = 0; iz < nz; iz++) {
    const z0 = sampleZ(iz), z1 = sampleZ(iz + 1);
    const west = Math.max(heights[index(0, iz)], heights[index(0, iz + 1)]);
    const east = Math.max(heights[index(nx, iz)], heights[index(nx, iz + 1)]);
    addStratifiedFace(
      positions, colors,
      new THREE.Vector3(bounds.minX, 0, z0),
      new THREE.Vector3(bounds.minX, 0, z1),
      0, west,
      bounds.minX, (z0 + z1) * 0.5,
    );
    addStratifiedFace(
      positions, colors,
      new THREE.Vector3(bounds.maxX, 0, z0),
      new THREE.Vector3(bounds.maxX, 0, z1),
      0, east,
      bounds.maxX, (z0 + z1) * 0.5,
    );
  }

  if (!positions.length) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  mesh.name = 'voxel-world-volume';
  mesh.frustumCulled = true;
  return mesh;
}

/**
 * Build actual water volume for survey mode: top surface + vertical shoreline
 * walls + bottom. This keeps water visually occupied in a channel instead of
 * making it appear as a floating sheet.
 */
export function buildVoxelWorldWaterVolumeMesh(): THREE.Mesh | null {
  const bounds = voxelWorldBounds();
  const sampleStep = 2;
  const nx = Math.ceil((bounds.maxX - bounds.minX) / sampleStep);
  const nz = Math.ceil((bounds.maxZ - bounds.minZ) / sampleStep);
  const colsX = nx + 1;
  const colsZ = nz + 1;
  const surface = new Float32Array(colsX * colsZ);
  const depth = new Float32Array(colsX * colsZ);
  const wet = new Uint8Array(colsX * colsZ);
  const positions: number[] = [];
  const colors: number[] = [];
  const index = (ix: number, iz: number) => iz * colsX + ix;
  const sampleX = (ix: number) => Math.min(bounds.maxX, bounds.minX + ix * sampleStep);
  const sampleZ = (iz: number) => Math.min(bounds.maxZ, bounds.minZ + iz * sampleStep);

  for (let iz = 0; iz < colsZ; iz++) {
    for (let ix = 0; ix < colsX; ix++) {
      const x = sampleX(ix), z = sampleZ(iz), d = waterDepthAt(x, z);
      const i = index(ix, iz);
      wet[i] = d > 0.02 ? 1 : 0;
      depth[i] = Math.max(0, d);
      surface[i] = waterSurfaceAt(x, z);
    }
  }

  const waterColor = new THREE.Color(0x247d9c);
  const addWaterQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, alphaColor = waterColor) => {
    for (const v of [a, b, c, a, c, d]) {
      positions.push(v.x, v.y, v.z);
      colors.push(alphaColor.r, alphaColor.g, alphaColor.b);
    }
  };

  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i00 = index(ix, iz), i10 = index(ix + 1, iz);
      const i01 = index(ix, iz + 1), i11 = index(ix + 1, iz + 1);
      if (!(wet[i00] || wet[i10] || wet[i01] || wet[i11])) continue;

      const x0 = sampleX(ix), x1 = sampleX(ix + 1);
      const z0 = sampleZ(iz), z1 = sampleZ(iz + 1);
      addWaterQuad(
        new THREE.Vector3(x0, surface[i00] + 0.02, z0),
        new THREE.Vector3(x0, surface[i01] + 0.02, z1),
        new THREE.Vector3(x1, surface[i11] + 0.02, z1),
        new THREE.Vector3(x1, surface[i10] + 0.02, z0),
      );

      // Water bottom follows the authoritative water depth, never the decorative
      // sea plane. A small cap avoids deep ocean walls overwhelming the survey.
      const b00 = surface[i00] - Math.min(depth[i00], 12);
      const b10 = surface[i10] - Math.min(depth[i10], 12);
      const b01 = surface[i01] - Math.min(depth[i01], 12);
      const b11 = surface[i11] - Math.min(depth[i11], 12);
      addWaterQuad(
        new THREE.Vector3(x0, b00, z0),
        new THREE.Vector3(x1, b10, z0),
        new THREE.Vector3(x1, b11, z1),
        new THREE.Vector3(x0, b01, z1),
      );

      const corners = [
        [i00, i01, x0, z0, z1, 'x'],
        [i10, i11, x1, z0, z1, 'x'],
        [i00, i10, z0, x0, x1, 'z'],
        [i01, i11, z1, x0, x1, 'z'],
      ] as const;

      for (const [a, b, fixed, t0, t1, axis] of corners) {
        const aWet = wet[a] === 1, bWet = wet[b] === 1;
        if (aWet === bWet) continue;

        const wetIndex = aWet ? a : b;
        const top = surface[wetIndex];
        const bottom = top - Math.min(depth[wetIndex], 12);

        if (axis === 'x') {
          addWaterQuad(
            new THREE.Vector3(fixed, bottom, t0),
            new THREE.Vector3(fixed, bottom, t1),
            new THREE.Vector3(fixed, top + 0.02, t1),
            new THREE.Vector3(fixed, top + 0.02, t0),
          );
        } else {
          addWaterQuad(
            new THREE.Vector3(t0, bottom, fixed),
            new THREE.Vector3(t1, bottom, fixed),
            new THREE.Vector3(t1, top + 0.02, fixed),
            new THREE.Vector3(t0, top + 0.02, fixed),
          );
        }
      }
    }
  }

  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: true,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = 'voxel-water-volume';
  mesh.frustumCulled = true;
  return mesh;
}
