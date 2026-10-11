import * as THREE from 'three';

// Only the rigid torso/head/face are combined. Animated limbs and the unlit
// chest marker remain separate, and original meshes retain exact headshot hits.
export function batchZombieBody(root: THREE.Group, parts: THREE.Mesh[]): THREE.MeshStandardMaterial {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  for (const part of parts) {
    part.updateMatrix();
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(part.matrix);
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
    const c = geometry.getAttribute('color');
    const material = part.material as THREE.MeshStandardMaterial;
    const tint = material.color;
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(part.matrix);
      normal.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(tint.r * (material.vertexColors && c ? c.getX(i) : 1),
        tint.g * (material.vertexColors && c ? c.getY(i) : 1),
        tint.b * (material.vertexColors && c ? c.getZ(i) : 1));
    }
    geometry.dispose();
    part.visible = false;
    part.matrixAutoUpdate = false;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true, emissiveIntensity: .24 });
  const batch = new THREE.Mesh(geometry, material);
  batch.name = 'zombie-body-batch';
  batch.castShadow = parts.some(part => part.castShadow);
  batch.receiveShadow = parts.some(part => part.receiveShadow);
  batch.userData.survivalRenderOnly = true;
  batch.raycast = () => {};
  batch.matrixAutoUpdate = false;
  root.add(batch);
  return material;
}
