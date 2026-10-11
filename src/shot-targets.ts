import * as THREE from 'three';

// Keep the original meshes authoritative (including hidden instanced sources).
// Nested collider markers must not cause the same hierarchy to be ray-tested twice.
export class ShotTargets {
  readonly meshes: THREE.Object3D[] = [];
  private readonly roots = new Set<THREE.Object3D>();

  prepare(objects: readonly THREE.Object3D[]): THREE.Object3D[] {
    this.meshes.length = 0;
    this.roots.clear();
    objects.forEach(object => this.roots.add(object));
    for (const root of this.roots) {
      let ancestor = root.parent;
      while (ancestor && !this.roots.has(ancestor)) ancestor = ancestor.parent;
      if (ancestor) continue;
      // Refresh moving doors and enemies without forcing every loaded chunk,
      // weather particle and distant prop in the scene to update on each shot.
      root.updateWorldMatrix(true, true);
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || object.userData.survivalRenderOnly) return;
        // Mesh.raycast can then reject rays against the local box before triangles.
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        this.meshes.push(object);
      });
    }
    return this.meshes;
  }
}
