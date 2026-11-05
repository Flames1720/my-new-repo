/**
 * Lightweight dedicated arena for multiplayer / bot FPS matches.
 * Intentionally small so phones do not load the full open world.
 */
import * as THREE from 'three';

export interface ArenaSpawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export class ArenaMap {
  readonly group = new THREE.Group();
  readonly colliders: THREE.Box3[] = [];
  readonly spawns: ArenaSpawn[] = [];

  private materials: THREE.Material[] = [];

  constructor() {
    this.group.name = 'ArenaMap';
    this.build();
  }

  private mat(color: number, rough = 0.85, metal = 0.05) {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal,
    });
    this.materials.push(m);
    return m;
  }

  private box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: number,
    rotatable = false,
  ) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, this.mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    this.colliders.push(box);
    return mesh;
  }

  private build() {
    // Floor
    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const floor = new THREE.Mesh(floorGeo, this.mat(0x3a3f3a, 0.95, 0));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Outer walls
    const wallH = 4;
    const wallT = 1.2;
    const size = 40;
    this.box(size * 2 + wallT * 2, wallH, wallT, 0, wallH / 2, -size, 0x555a5e);
    this.box(size * 2 + wallT * 2, wallH, wallT, 0, wallH / 2, size, 0x555a5e);
    this.box(wallT, wallH, size * 2, -size, wallH / 2, 0, 0x555a5e);
    this.box(wallT, wallH, size * 2, size, wallH / 2, 0, 0x555a5e);

    // Central cover + lanes for interesting fights
    this.box(6, 2.2, 6, 0, 1.1, 0, 0x6b5b4a); // center crate stack
    this.box(3, 1.4, 3, 8, 0.7, 6, 0x4a5560);
    this.box(3, 1.4, 3, -9, 0.7, -5, 0x4a5560);
    this.box(2.5, 3.5, 2.5, 12, 1.75, -10, 0x5c4a3a); // tall pillar
    this.box(2.5, 3.5, 2.5, -11, 1.75, 11, 0x5c4a3a);

    // Low walls / ramps for verticality
    this.box(10, 1.2, 1.5, -15, 0.6, 8, 0x4e5a4e);
    this.box(10, 1.2, 1.5, 15, 0.6, -8, 0x4e5a4e);
    this.box(1.5, 1.2, 12, 6, 0.6, 16, 0x4e5a4e);
    this.box(1.5, 1.2, 12, -6, 0.6, -16, 0x4e5a4e);

    // Elevated platforms
    this.box(8, 0.4, 8, -18, 2.2, -18, 0x6a7068);
    this.box(2, 2.2, 2, -18, 1.1, -14, 0x5a6058); // support
    this.box(8, 0.4, 8, 18, 2.2, 18, 0x6a7068);
    this.box(2, 2.2, 2, 18, 1.1, 14, 0x5a6058);

    // Simple ramps (rotated boxes)
    const ramp1 = this.box(6, 0.4, 3, -18, 1.1, -10, 0x5a6058);
    ramp1.rotation.z = 0.35;
    const ramp2 = this.box(6, 0.4, 3, 18, 1.1, 10, 0x5a6058);
    ramp2.rotation.z = -0.35;

    // Spawn points around the map
    this.spawns.push(
      { x: -28, y: 0, z: -28, yaw: Math.PI / 4 },
      { x: 28, y: 0, z: -28, yaw: -Math.PI / 4 },
      { x: -28, y: 0, z: 28, yaw: (3 * Math.PI) / 4 },
      { x: 28, y: 0, z: 28, yaw: (-3 * Math.PI) / 4 },
      { x: 0, y: 0, z: -30, yaw: 0 },
      { x: 0, y: 0, z: 30, yaw: Math.PI },
      { x: -30, y: 0, z: 0, yaw: Math.PI / 2 },
      { x: 30, y: 0, z: 0, yaw: -Math.PI / 2 },
    );

    // Soft ambient lighting helper (caller still owns main lights)
    const hemi = new THREE.HemisphereLight(0xb0c4de, 0x3a3a30, 0.55);
    this.group.add(hemi);
  }

  getSpawn(index: number): ArenaSpawn {
    return this.spawns[index % this.spawns.length];
  }

  /** Very cheap axis-aligned collision against arena boxes. */
  resolveCollision(position: THREE.Vector3, radius = 0.4, height = 1.7) {
    const playerBox = new THREE.Box3(
      new THREE.Vector3(position.x - radius, position.y, position.z - radius),
      new THREE.Vector3(position.x + radius, position.y + height, position.z + radius),
    );

    for (const col of this.colliders) {
      if (!playerBox.intersectsBox(col)) continue;
      // Simple push-out on XZ
      const overlapX = Math.min(playerBox.max.x - col.min.x, col.max.x - playerBox.min.x);
      const overlapZ = Math.min(playerBox.max.z - col.min.z, col.max.z - playerBox.min.z);
      if (overlapX < overlapZ) {
        if (position.x < (col.min.x + col.max.x) / 2) position.x -= overlapX;
        else position.x += overlapX;
      } else {
        if (position.z < (col.min.z + col.max.z) / 2) position.z -= overlapZ;
        else position.z += overlapZ;
      }
      // refresh player box for next collider
      playerBox.min.set(position.x - radius, position.y, position.z - radius);
      playerBox.max.set(position.x + radius, position.y + height, position.z + radius);
    }
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
      }
    });
    for (const m of this.materials) m.dispose();
    this.materials = [];
    this.colliders.length = 0;
  }
}
