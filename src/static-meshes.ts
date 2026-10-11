import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Combine opaque pieces of one static resource, keeping its parent (and therefore
// resource identity, hit handling, collision and placement) intact. Never batch
// across resources: harvesting a tree must still remove exactly that tree.
export function compactStaticResource(root: THREE.Group, isShared: (geometry: THREE.BufferGeometry) => boolean = () => false): void {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<string, THREE.Mesh[]>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh ||
        Array.isArray(object.material) || object.material.transparent ||
        Object.keys(object.geometry.morphAttributes).length || !object.visible) return;
    const layout = Object.keys(object.geometry.attributes).sort().map(name => {
      const attribute = object.geometry.getAttribute(name);
      return `${name}:${attribute.itemSize}:${attribute.normalized}`;
    }).join(',');
    const key = `${object.material.uuid}/${!!object.geometry.index}/${layout}/${object.castShadow}/${object.receiveShadow}`;
    const meshes = buckets.get(key) ?? [];
    meshes.push(object);
    buckets.set(key, meshes);
  });
  const retired = new Set<THREE.BufferGeometry>();
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const copies = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)));
    const merged = mergeGeometries(copies, false);
    copies.forEach(geometry => geometry.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const batch = new THREE.Mesh(merged, meshes[0].material);
    batch.name = 'resource-batch';
    batch.castShadow = meshes[0].castShadow;
    batch.receiveShadow = meshes[0].receiveShadow;
    for (const mesh of meshes) {
      retired.add(mesh.geometry);
      mesh.removeFromParent();
    }
    root.add(batch);
  }
  // A geometry can be reused by an unbatched part. Only release retired, owned
  // geometry; shared GLB templates and shared fruit geometry remain live.
  root.traverse(object => {
    if (object instanceof THREE.Mesh) retired.delete(object.geometry);
  });
  retired.forEach(geometry => { if (!isShared(geometry)) geometry.dispose(); });
  // Local transforms are static; parents remain movable for placement/harvesting.
  root.traverse(object => {
    if (object === root) return;
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
}
