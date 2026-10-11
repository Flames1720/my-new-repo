import * as THREE from 'three';

type Trace = { object: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; age: number; active: boolean };
type Impact = { object: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; age: number; active: boolean };

// Retain short-lived combat resources between shots. A shotgun burst used to
// allocate/upload/dispose a geometry and material for every pellet and impact.
// The cap only limits simultaneous cosmetic effects; hits and damage are separate.
export class CombatEffects {
  private readonly traces: Trace[] = [];
  private readonly impacts: Impact[] = [];
  private readonly traceMaterial = new THREE.LineBasicMaterial({ color: 0xffd49a, transparent: true, opacity: 0.7 });
  private readonly impactGeometry = new THREE.SphereGeometry(1, 5, 4);
  private disposed = false;
  private static readonly capacity = 32;

  constructor(private readonly scene: THREE.Scene) {
    this.traceMaterial.name = 'SurvivalTracer';
    // Prepare enough slots for a complete shotgun burst before deployment.
    for (let i = 0; i < 8; i++) {
      this.traces.push(this.createTrace());
      this.impacts.push(this.createImpact());
    }
  }

  get tracerCount(): number { return this.traces.reduce((n, item) => n + Number(item.active), 0); }
  get impactCount(): number { return this.impacts.reduce((n, item) => n + Number(item.active), 0); }

  private createTrace(): Trace {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    const object = new THREE.Line(geometry, this.traceMaterial);
    object.name = 'survival-tracer';
    // Two endpoints change each shot; avoid stale bounds and bounding-sphere work.
    object.frustumCulled = false;
    return { object, age: 0, active: false };
  }

  private createImpact(): Impact {
    const object = new THREE.Mesh(this.impactGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }));
    object.name = 'survival-impact';
    object.castShadow = true;
    object.receiveShadow = true;
    return { object, age: 0, active: false };
  }

  private acquire<T extends Trace | Impact>(pool: T[], create: () => T): T {
    let item = pool.find(entry => !entry.active);
    if (!item && pool.length < CombatEffects.capacity) {
      item = create();
      pool.push(item);
    }
    // Recycle the oldest cosmetic if unusually many effects overlap.
    item ??= pool.reduce((oldest, entry) => entry.age > oldest.age ? entry : oldest);
    item.age = 0;
    item.active = true;
    if (!item.object.parent) this.scene.add(item.object);
    return item;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    if (this.disposed) return;
    const item = this.acquire(this.traces, () => this.createTrace());
    const positions = item.object.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
  }

  impact(position: THREE.Vector3, blood: boolean): void {
    if (this.disposed) return;
    const item = this.acquire(this.impacts, () => this.createImpact());
    item.object.position.copy(position);
    item.object.scale.setScalar(blood ? 0.075 : 0.045);
    item.object.material.color.setHex(blood ? 0x9e302d : 0xffc66d);
    item.object.material.opacity = 0.9;
  }

  update(dt: number): void {
    for (const item of this.traces) {
      if (!item.active) continue;
      item.age += dt;
      if (item.age >= 0.055) this.release(item);
    }
    for (const item of this.impacts) {
      if (!item.active) continue;
      item.age += dt;
      item.object.material.opacity = Math.max(0, 1 - item.age / 0.13);
      if (item.age >= 0.13) this.release(item);
    }
  }

  private release(item: Trace | Impact): void {
    item.active = false;
    item.object.removeFromParent();
  }

  clear(): void {
    for (const item of this.traces) this.release(item);
    for (const item of this.impacts) this.release(item);
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.traces.forEach(item => item.object.geometry.dispose());
    this.impacts.forEach(item => item.object.material.dispose());
    this.impactGeometry.dispose();
    this.traceMaterial.dispose();
    this.disposed = true;
  }
}
