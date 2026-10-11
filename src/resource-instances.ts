import * as THREE from 'three';

type Binding = { batch: THREE.InstancedMesh; index: number; source: THREE.Mesh };
type InstanceResourceData = {
  syncInstances?: () => void;
  removeInstances?: () => void;
};

// Render repeated shared GLB parts together, but retain each resource's original
// hierarchy for exact raycasts and existing collider/harvest/save behaviour.
// Three.js raycasting intentionally ignores Mesh.visible; only render traversal
// hides these source meshes. Resource roots remain visible and interactive.
export function instanceChunkResources(chunk: THREE.Group, isShared: (geometry: THREE.BufferGeometry) => boolean): void {
  chunk.updateMatrixWorld(true);
  const inverse = chunk.matrixWorld.clone().invert();
  const groups = new Map<string, { resource: THREE.Object3D; mesh: THREE.Mesh }[]>();
  for (const resource of chunk.children) {
    if (!resource.userData.resource) continue;
    resource.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh ||
          !object.visible || !isShared(object.geometry) || Array.isArray(object.material) ||
          object.material.transparent || Object.keys(object.geometry.morphAttributes).length) return;
      const key = `${object.geometry.uuid}/${object.material.uuid}/${object.castShadow}/${object.receiveShadow}`;
      const group = groups.get(key) ?? [];
      group.push({ resource, mesh: object });
      groups.set(key, group);
    });
  }
  const bindings = new Map<THREE.Object3D, Binding[]>();
  const transform = new THREE.Matrix4();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const source = group[0].mesh;
    const batch = new THREE.InstancedMesh(source.geometry, source.material, group.length);
    batch.name = 'resource-instances';
    batch.castShadow = source.castShadow;
    batch.receiveShadow = source.receiveShadow;
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.raycast = () => {}; // hits resolve through the original resource meshes
    group.forEach(({ resource, mesh }, index) => {
      batch.setMatrixAt(index, transform.multiplyMatrices(inverse, mesh.matrixWorld));
      mesh.visible = false;
      const list = bindings.get(resource) ?? [];
      list.push({ batch, index, source: mesh });
      bindings.set(resource, list);
    });
    batch.computeBoundingSphere();
    chunk.add(batch);
  }
  for (const [resource, list] of bindings) {
    const data = resource.userData as InstanceResourceData;
    data.syncInstances = () => {
      resource.updateWorldMatrix(true, true);
      for (const { batch, index, source } of list) {
        batch.setMatrixAt(index, transform.multiplyMatrices(inverse, source.matrixWorld));
        batch.instanceMatrix.needsUpdate = true;
        batch.boundingSphere = null; // recompute after any resource transform
      }
    };
    data.removeInstances = () => {
      const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
      for (const { batch, index } of list) {
        batch.setMatrixAt(index, hidden);
        batch.instanceMatrix.needsUpdate = true;
      }
      delete data.syncInstances;
      delete data.removeInstances;
    };
  }
}
