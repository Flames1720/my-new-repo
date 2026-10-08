import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type EnvironmentAssetKind = 'oak' | 'pine' | 'palm' | 'rock' | 'boulder';

const CDN_ROOT =
  'https://cdn.jsdelivr.net/gh/syuhei176/ai-game-assets@ebfd758dea8db5793c765cc72564efadb36a4ed0/models/environment';

const URLS: Record<EnvironmentAssetKind, string> = {
  oak: `${CDN_ROOT}/tree_oak.glb`,
  pine: `${CDN_ROOT}/tree_pine.glb`,
  palm: `${CDN_ROOT}/tree_palm.glb`,
  rock: `${CDN_ROOT}/rock_small.glb`,
  boulder: `${CDN_ROOT}/rock_large.glb`,
};

const templates = new Map<EnvironmentAssetKind, THREE.Object3D>();
const sharedGeometries = new WeakSet<THREE.BufferGeometry>();
const sharedMaterials = new WeakSet<THREE.Material>();
const loader = new GLTFLoader();

function markShared(root: THREE.Object3D) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    sharedGeometries.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) sharedMaterials.add(material);
  });
}

function loadOne(kind: EnvironmentAssetKind): Promise<void> {
  return new Promise(resolve => {
    loader.load(
      URLS[kind],
      gltf => {
        const template = gltf.scene;
        template.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
        });
        markShared(template);
        templates.set(kind, template);
        resolve();
      },
      undefined,
      () => resolve(),
    );
  });
}

export const environmentAssets = {
  async preload(): Promise<void> {
    await Promise.all((Object.keys(URLS) as EnvironmentAssetKind[]).map(loadOne));
  },

  ready(): boolean {
    return templates.size === Object.keys(URLS).length;
  },

  isSharedGeometry(geometry: THREE.BufferGeometry): boolean {
    return sharedGeometries.has(geometry);
  },

  isSharedMaterial(material: THREE.Material): boolean {
    return sharedMaterials.has(material);
  },

  createTree(kind: 'oak' | 'pine' | 'palm' | 'fruit' | 'ancient_oak' | 'rock' | 'boulder', lod: number): THREE.Group | null {
    if (kind === 'rock' || kind === 'boulder') return null;
    const assetKind: EnvironmentAssetKind =
      kind === 'pine' ? 'pine' :
      kind === 'palm' ? 'palm' :
      'oak';

    const template = templates.get(assetKind);
    if (!template) return null;

    const root = new THREE.Group();
    const model = template.clone(true);
    const scale =
      kind === 'ancient_oak' ? 6.0 :
      kind === 'fruit' ? 4.4 :
      kind === 'palm' ? 4.2 :
      kind === 'pine' ? 4.8 :
      4.8;

    model.scale.setScalar(scale);
    if (lod > 0) {
      model.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = false;
          object.receiveShadow = false;
        }
      });
    }
    root.add(model);
    return root;
  },

  createRock(kind: 'rock' | 'boulder', lod: number): THREE.Group | null {
    const template = templates.get(kind);
    if (!template) return null;

    const root = new THREE.Group();
    const model = template.clone(true);
    model.scale.setScalar(kind === 'boulder' ? 2.8 : 2.1);
    // Rotation is assigned by the deterministic world builder after placement.
    if (lod > 0) {
      model.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = false;
          object.receiveShadow = false;
        }
      });
    }
    root.add(model);
    return root;
  },
};
