import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CharacterModelId, EmoteKind, Gender } from './types';
import { clamp, lerp } from './terrain';

export type CharacterOutfitKind = 'explorer' | 'ranger' | 'scout' | 'arctic' | 'lagos';

export const OUTFIT_PALETTES: Record<
  CharacterOutfitKind,
  {
    tunic: number;
    tunicTrim: number;
    pants: number;
    leather: number;
    boots: number;
    metal: number;
    accent: number;
  }
> = {
  explorer: {
    tunic: 0x2b6ca3,
    tunicTrim: 0xf2c14e,
    pants: 0x3d352e,
    leather: 0x824d27,
    boots: 0x422817,
    metal: 0xe6b843,
    accent: 0xf5ba42,
  },
  ranger: {
    tunic: 0x2e6b35,
    tunicTrim: 0xb5954e,
    pants: 0x332c25,
    leather: 0x734320,
    boots: 0x3d2716,
    metal: 0xa8c256,
    accent: 0xb5954e,
  },
  scout: {
    tunic: 0xc25a2b,
    tunicTrim: 0xf0c85d,
    pants: 0x453e36,
    leather: 0x6e3c1d,
    boots: 0x3b2414,
    metal: 0xdeb841,
    accent: 0xf2cb61,
  },
  arctic: {
    tunic: 0x5486ad,
    tunicTrim: 0xf0f5fa,
    pants: 0x2b3847,
    leather: 0x4a3b32,
    boots: 0x222a33,
    metal: 0xd9e5eb,
    accent: 0xffffff,
  },
  lagos: {
    tunic: 0x138a4b,
    tunicTrim: 0xf5c027,
    pants: 0x1f2421,
    leather: 0x8a5528,
    boots: 0x241810,
    metal: 0xf5ba2c,
    accent: 0xf5c027,
  },
};

export const PLAYER_CHARACTER_MODELS: Record<CharacterModelId, { label: string; url: string }> = {
  'quaternius-adventurer': { label: 'Quaternius Adventurer', url: '/models/characters/quaternius-adventurer.glb' },
  'quaternius-animated-human': { label: 'Quaternius Animated Human', url: '/models/characters/quaternius-animated-human.glb' },
  'quaternius-animated-woman': { label: 'Quaternius Animated Woman', url: '/models/characters/quaternius-animated-woman.glb' },
  'kenney-adventurer': { label: 'Kenney Adventurer', url: '/models/kenney-adventurer.glb' },
  'mixamo-walker': { label: 'Mixamo Walker', url: '/models/characters/mixamo-walker.glb' },
  'legacy-rigged': { label: 'Original custom model', url: '/assets/rigged-model.glb' },
};

export function isCharacterModelId(value: unknown): value is CharacterModelId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLAYER_CHARACTER_MODELS, value);
}

export class PlayerCharacter {
  root = new THREE.Group();
  velocity = new THREE.Vector3();
  onGround = true;
  swimming = false;

  private gender: Gender = 'male';
  private currentOutfit: CharacterOutfitKind = 'explorer';

  private rigRoot = new THREE.Group();
  private pelvis = new THREE.Group();
  private spine = new THREE.Group();
  private chest = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();

  private leftClavicle = new THREE.Group();
  private leftUpperArm = new THREE.Group();
  private leftForearm = new THREE.Group();
  private leftHand = new THREE.Group();

  private rightClavicle = new THREE.Group();
  private rightUpperArm = new THREE.Group();
  private rightForearm = new THREE.Group();
  private rightHand = new THREE.Group();

  private leftHip = new THREE.Group();
  private leftThigh = new THREE.Group();
  private leftCalf = new THREE.Group();
  private leftFoot = new THREE.Group();

  private rightHip = new THREE.Group();
  private rightThigh = new THREE.Group();
  private rightCalf = new THREE.Group();
  private rightFoot = new THREE.Group();

  private hairGroup = new THREE.Group();
  private hatGroup = new THREE.Group();

  private outfitMeshes: {
    mesh: THREE.Mesh;
    part: 'tunic' | 'tunicTrim' | 'pants' | 'leather' | 'boots' | 'metal' | 'accent';
  }[] = [];

  private charKeyLight: THREE.PointLight;
  private charFillLight: THREE.PointLight;

  private walkPhase = 0;
  private locomotionBlend = 0;
  private landingSquash = 0;
  private currentEmote: EmoteKind = 'none';
  private emoteTime = 0;

  private modelRoot: THREE.Group | null = null;
  private modelMixer: THREE.AnimationMixer | null = null;
  private modelBaseScale = 1;
  private modelActions = new Map<string, THREE.AnimationAction>();
  private activeModelAction: THREE.AnimationAction | null = null;
  private modelReady = false;
  private modelLoading = false;
  private modelRequestVersion = 0;
  private currentModelId: CharacterModelId = 'quaternius-adventurer';
  private modelAnimation = '';
  private locomotionState: 'idle' | 'walk' | 'run' | 'backward' | 'strafe-left' | 'strafe-right' | 'airborne' | 'swim' | 'jump' | 'fall' | 'crouch' | 'gather' | 'climb' | 'turn' | 'emote' = 'idle';
  private wasAirborne = false;
  private landingTime = 0;
  private wasSwimming = false;
  private swimPoseBaseRotations = new Map<string, THREE.Euler>();

  private mixamoBones: {
    hips?: THREE.Object3D;
    spine?: THREE.Object3D;
    spine1?: THREE.Object3D;
    spine2?: THREE.Object3D;
    neck?: THREE.Object3D;
    head?: THREE.Object3D;
    leftUpLeg?: THREE.Object3D;
    leftLeg?: THREE.Object3D;
    leftFoot?: THREE.Object3D;
    rightUpLeg?: THREE.Object3D;
    rightLeg?: THREE.Object3D;
    rightFoot?: THREE.Object3D;
    leftArm?: THREE.Object3D;
    leftForeArm?: THREE.Object3D;
    rightArm?: THREE.Object3D;
    rightForeArm?: THREE.Object3D;
  } = {};
  private jumpPoseActive = false;
  private jumpAirTime = 0;
  private lastVelocityY = 0;
  private restBoneRotations = new Map<string, THREE.Euler>();

  constructor(lowPowerMode: boolean, modelId: CharacterModelId = 'quaternius-adventurer', onLoaded?: () => void) {
    this.root.name = 'player-character-rig';
    this.charKeyLight = new THREE.PointLight(0xfff7ea, 2.2, 5.5);
    this.charKeyLight.position.set(0, 1.6, 1.2);
    this.root.add(this.charKeyLight);
    this.charFillLight = new THREE.PointLight(0xdceeff, 1.4, 4.5);
    this.charFillLight.position.set(-0.6, 1.2, -0.8);
    this.root.add(this.charFillLight);
    this.buildSkeletalHierarchy();
    this.buildAnatomicalModel(lowPowerMode);
    this.applyOutfit(this.currentOutfit);
    this.applyGender(this.gender);
    this.currentModelId = modelId;
    this.loadProductionModel(modelId, onLoaded);
    if (onLoaded) setTimeout(onLoaded, 50);
  }

  private buildSkeletalHierarchy() {
    this.rigRoot.name = 'rig-root';
    this.root.add(this.rigRoot);
    this.pelvis.name = 'bone-pelvis';
    this.pelvis.position.set(0, 0.92, 0);
    this.rigRoot.add(this.pelvis);
    this.spine.name = 'bone-spine';
    this.spine.position.set(0, 0.16, 0);
    this.pelvis.add(this.spine);
    this.chest.name = 'bone-chest';
    this.chest.position.set(0, 0.22, 0);
    this.spine.add(this.chest);
    this.neck.name = 'bone-neck';
    this.neck.position.set(0, 0.24, 0);
    this.chest.add(this.neck);
    this.head.name = 'bone-head';
    this.head.position.set(0, 0.12, 0);
    this.neck.add(this.head);
    this.leftClavicle.name = 'bone-clavicle-l';
    this.leftClavicle.position.set(0.24, 0.16, 0);
    this.chest.add(this.leftClavicle);
    this.leftUpperArm.name = 'bone-upperarm-l';
    this.leftUpperArm.position.set(0.06, -0.02, 0);
    this.leftClavicle.add(this.leftUpperArm);
    this.leftForearm.name = 'bone-forearm-l';
    this.leftForearm.position.set(0, -0.28, 0);
    this.leftUpperArm.add(this.leftForearm);
    this.leftHand.name = 'bone-hand-l';
    this.leftHand.position.set(0, -0.26, 0);
    this.leftForearm.add(this.leftHand);
    this.rightClavicle.name = 'bone-clavicle-r';
    this.rightClavicle.position.set(-0.24, 0.16, 0);
    this.chest.add(this.rightClavicle);
    this.rightUpperArm.name = 'bone-upperarm-r';
    this.rightUpperArm.position.set(-0.06, -0.02, 0);
    this.rightClavicle.add(this.rightUpperArm);
    this.rightForearm.name = 'bone-forearm-r';
    this.rightForearm.position.set(0, -0.28, 0);
    this.rightUpperArm.add(this.rightForearm);
    this.rightHand.name = 'bone-hand-r';
    this.rightHand.position.set(0, -0.26, 0);
    this.rightForearm.add(this.rightHand);
    this.leftHip.name = 'bone-hip-l';
    this.leftHip.position.set(0.14, -0.04, 0);
    this.pelvis.add(this.leftHip);
    this.leftThigh.name = 'bone-thigh-l';
    this.leftThigh.position.set(0, 0, 0);
    this.leftHip.add(this.leftThigh);
    this.leftCalf.name = 'bone-calf-l';
    this.leftCalf.position.set(0, -0.42, 0);
    this.leftThigh.add(this.leftCalf);
    this.leftFoot.name = 'bone-foot-l';
    this.leftFoot.position.set(0, -0.42, 0.04);
    this.leftCalf.add(this.leftFoot);
    this.rightHip.name = 'bone-hip-r';
    this.rightHip.position.set(-0.14, -0.04, 0);
    this.pelvis.add(this.rightHip);
    this.rightThigh.name = 'bone-thigh-r';
    this.rightThigh.position.set(0, 0, 0);
    this.rightHip.add(this.rightThigh);
    this.rightCalf.name = 'bone-calf-r';
    this.rightCalf.position.set(0, -0.42, 0);
    this.rightThigh.add(this.rightCalf);
    this.rightFoot.name = 'bone-foot-r';
    this.rightFoot.position.set(0, -0.42, 0.04);
    this.rightCalf.add(this.rightFoot);
  }

  private buildAnatomicalModel(lowPowerMode: boolean) {
    this.outfitMeshes = [];
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd1b3, roughness: 0.52, metalness: 0.0, emissive: new THREE.Color(0x38261e) });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const irisMat = new THREE.MeshStandardMaterial({ color: 0x1b72a8, roughness: 0.25 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
    const blushMat = new THREE.MeshStandardMaterial({ color: 0xf5988e, roughness: 0.8 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0xd95763, roughness: 0.5 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x3d2716, roughness: 0.75 });
    const tunicMat = new THREE.MeshStandardMaterial({ color: 0x2b6ca3, roughness: 0.75 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.65 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3d352e, roughness: 0.82 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x824d27, roughness: 0.72 });
    const bootsMat = new THREE.MeshStandardMaterial({ color: 0x422817, roughness: 0.7 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xe6b843, roughness: 0.35, metalness: 0.75 });

    const createMesh = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      parent: THREE.Object3D,
      pos: [number, number, number] = [0, 0, 0],
      scale: [number, number, number] = [1, 1, 1],
      role?: 'tunic' | 'tunicTrim' | 'pants' | 'leather' | 'boots' | 'metal' | 'accent'
    ): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.set(...scale);
      m.castShadow = !lowPowerMode;
      m.receiveShadow = true;
      parent.add(m);
      if (role) this.outfitMeshes.push({ mesh: m, part: role });
      return m;
    };

    createMesh(new THREE.SphereGeometry(0.19, 14, 12), skinMat, this.head, [0, 0.08, 0], [0.92, 1.05, 0.98]);
    const jaw = createMesh(new THREE.ConeGeometry(0.12, 0.16, 8), skinMat, this.head, [0, -0.04, 0.04]);
    jaw.rotation.x = Math.PI;
    for (const sx of [-1, 1]) {
      createMesh(new THREE.BoxGeometry(0.065, 0.065, 0.02), eyeWhiteMat, this.head, [sx * 0.075, 0.08, 0.165]);
      createMesh(new THREE.BoxGeometry(0.042, 0.052, 0.022), irisMat, this.head, [sx * 0.075, 0.08, 0.17]);
      createMesh(new THREE.BoxGeometry(0.022, 0.03, 0.024), pupilMat, this.head, [sx * 0.075, 0.08, 0.174]);
      createMesh(new THREE.SphereGeometry(0.009, 4, 4), eyeWhiteMat, this.head, [sx * 0.068, 0.092, 0.18]);
      createMesh(new THREE.BoxGeometry(0.05, 0.024, 0.01), blushMat, this.head, [sx * 0.09, 0.03, 0.162]);
      createMesh(new THREE.BoxGeometry(0.065, 0.014, 0.02), hairMat, this.head, [sx * 0.075, 0.128, 0.165]);
    }
    createMesh(new THREE.BoxGeometry(0.05, 0.016, 0.015), mouthMat, this.head, [0, -0.025, 0.165]);
    for (const sx of [-1, 1]) createMesh(new THREE.BoxGeometry(0.028, 0.06, 0.04), skinMat, this.head, [sx * 0.18, 0.07, 0]);

    this.head.add(this.hairGroup);
    this.head.add(this.hatGroup);
    createMesh(new THREE.SphereGeometry(0.205, 12, 10), hairMat, this.hairGroup, [0, 0.1, -0.02], [1, 1.05, 1.05]);
    createMesh(new THREE.BoxGeometry(0.24, 0.08, 0.08), hairMat, this.hairGroup, [0, 0.18, 0.14]);
    createMesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), hairMat, this.hairGroup, [-0.12, 0.08, 0.12]);
    createMesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), hairMat, this.hairGroup, [0.12, 0.08, 0.12]);
    createMesh(new THREE.CylinderGeometry(0.18, 0.22, 0.14, 10), leatherMat, this.hatGroup, [0, 0.2, -0.01], [1, 1, 1], 'leather');
    createMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.025, 14), leatherMat, this.hatGroup, [0, 0.13, 0.02], [1, 1, 1], 'leather');
    createMesh(new THREE.CylinderGeometry(0.225, 0.225, 0.035, 10), brassMat, this.hatGroup, [0, 0.15, -0.01], [1, 1, 1], 'metal');
    const feather = createMesh(new THREE.ConeGeometry(0.04, 0.22, 4), trimMat, this.hatGroup, [0.18, 0.28, -0.01], [1, 1, 0.4], 'accent');
    feather.rotation.z = -0.35;

    createMesh(new THREE.CylinderGeometry(0.075, 0.085, 0.14, 8), skinMat, this.neck, [0, 0.04, 0]);
    createMesh(new THREE.BoxGeometry(0.44, 0.32, 0.28), tunicMat, this.chest, [0, 0.02, 0], [1, 1, 1], 'tunic');
    createMesh(new THREE.BoxGeometry(0.46, 0.28, 0.3), leatherMat, this.chest, [0, 0.03, 0], [1, 1, 1], 'leather');
    createMesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), trimMat, this.chest, [0, 0.12, 0], [1, 1, 1], 'tunicTrim');
    createMesh(new THREE.BoxGeometry(0.4, 0.24, 0.26), tunicMat, this.spine, [0, -0.02, 0], [1, 1, 1], 'tunic');
    createMesh(new THREE.BoxGeometry(0.42, 0.08, 0.28), leatherMat, this.pelvis, [0, 0.04, 0], [1, 1, 1], 'leather');
    createMesh(new THREE.BoxGeometry(0.12, 0.1, 0.3), brassMat, this.pelvis, [0, 0.04, 0], [1, 1, 1], 'metal');
    createMesh(new THREE.BoxGeometry(0.12, 0.14, 0.1), leatherMat, this.pelvis, [0.22, 0.01, 0.04], [1, 1, 1], 'leather');
    createMesh(new THREE.BoxGeometry(0.38, 0.18, 0.26), pantsMat, this.pelvis, [0, -0.08, 0], [1, 1, 1], 'pants');
    createMesh(new THREE.BoxGeometry(0.36, 0.44, 0.22), tunicMat, this.chest, [0, 0.02, -0.24], [1, 1, 1], 'tunic');
    createMesh(new THREE.BoxGeometry(0.38, 0.16, 0.24), leatherMat, this.chest, [0, 0.16, -0.24], [1, 1, 1], 'leather');
    const bedroll = createMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 8), leatherMat, this.chest, [0, 0.28, -0.24], [1, 1, 1], 'leather');
    bedroll.rotation.z = Math.PI / 2;

    for (const arm of [this.leftUpperArm, this.rightUpperArm]) {
      createMesh(new THREE.CylinderGeometry(0.075, 0.07, 0.26, 8), tunicMat, arm, [0, -0.13, 0], [1, 1, 1], 'tunic');
      createMesh(new THREE.CylinderGeometry(0.082, 0.082, 0.05, 8), trimMat, arm, [0, -0.25, 0], [1, 1, 1], 'tunicTrim');
    }
    for (const forearm of [this.leftForearm, this.rightForearm]) {
      createMesh(new THREE.CylinderGeometry(0.065, 0.055, 0.24, 8), skinMat, forearm, [0, -0.12, 0]);
      createMesh(new THREE.CylinderGeometry(0.072, 0.062, 0.14, 8), leatherMat, forearm, [0, -0.12, 0], [1, 1, 1], 'leather');
    }
    for (const hand of [this.leftHand, this.rightHand]) {
      createMesh(new THREE.BoxGeometry(0.075, 0.11, 0.055), skinMat, hand, [0, -0.05, 0]);
      createMesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), skinMat, hand, [0.035, -0.03, 0.02]);
      createMesh(new THREE.BoxGeometry(0.068, 0.035, 0.045), skinMat, hand, [0, -0.115, 0]);
    }
    for (const thigh of [this.leftThigh, this.rightThigh]) {
      createMesh(new THREE.CylinderGeometry(0.09, 0.08, 0.4, 8), pantsMat, thigh, [0, -0.2, 0], [1, 1, 1], 'pants');
    }
    for (const calf of [this.leftCalf, this.rightCalf]) {
      createMesh(new THREE.CylinderGeometry(0.08, 0.075, 0.22, 8), pantsMat, calf, [0, -0.11, 0], [1, 1, 1], 'pants');
      createMesh(new THREE.CylinderGeometry(0.085, 0.08, 0.24, 8), bootsMat, calf, [0, -0.28, 0], [1, 1, 1], 'boots');
    }
    for (const foot of [this.leftFoot, this.rightFoot]) {
      createMesh(new THREE.BoxGeometry(0.12, 0.09, 0.24), bootsMat, foot, [0, -0.04, 0.04], [1, 1, 1], 'boots');
      createMesh(new THREE.BoxGeometry(0.13, 0.035, 0.25), leatherMat, foot, [0, -0.08, 0.04], [1, 1, 1], 'leather');
    }
  }

  private disposeModelResources(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of meshMaterials) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    });
    for (const texture of textures) texture.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  private disposeLoadedModel() {
    if (this.modelMixer && this.modelRoot) {
      this.modelMixer.stopAllAction();
      this.modelMixer.uncacheRoot(this.modelRoot);
    }
    this.modelMixer = null;
    this.modelActions.clear();
    this.activeModelAction = null;
    this.modelBaseScale = 1;
    this.modelReady = false;
    this.modelLoading = false;
    this.modelAnimation = '';
    this.locomotionState = 'idle';
    if (this.modelRoot) {
      this.root.remove(this.modelRoot);
      this.disposeModelResources(this.modelRoot);
      this.modelRoot = null;
    }
    this.mixamoBones = {};
    this.restBoneRotations.clear();
    this.swimPoseBaseRotations.clear();
    this.wasSwimming = false;
  }

  setCharacterModel(modelId: CharacterModelId) {
    if (!isCharacterModelId(modelId)) return;
    if (modelId === this.currentModelId && (this.modelReady || this.modelLoading)) return;
    this.currentModelId = modelId;
    this.modelRequestVersion++;
    this.disposeLoadedModel();
    this.rigRoot.visible = true;
    this.loadProductionModel(modelId);
  }

  private loadProductionModel(modelId: CharacterModelId, onLoaded?: () => void) {
    const requestVersion = ++this.modelRequestVersion;
    this.modelLoading = true;
    const loader = new GLTFLoader();
    loader.load(
      PLAYER_CHARACTER_MODELS[modelId].url,
      gltf => {
        if (requestVersion !== this.modelRequestVersion) {
          this.disposeModelResources(gltf.scene);
          return;
        }
        const model = gltf.scene;
        model.name = 'player-production-model';
        model.rotation.set(0, 0, 0);
        model.position.set(0, 0, 0);
        model.scale.setScalar(1);
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const sourceHeight = bounds.max.y - bounds.min.y;
        this.modelBaseScale = sourceHeight > 0.01 && Number.isFinite(sourceHeight) ? 1.75 / sourceHeight : 1;
        model.scale.setScalar(this.modelBaseScale);
        if (sourceHeight > 0.01 && Number.isFinite(sourceHeight)) {
          model.position.y = -bounds.min.y * this.modelBaseScale;
        }

        model.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
            object.frustumCulled = false;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
              if (material instanceof THREE.MeshStandardMaterial) {
                const m = material;
                if (m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace;
                  m.map.needsUpdate = true;
                }
                m.needsUpdate = true;
              }
            }
          }
        });

        this.modelRoot = model;
        this.root.add(model);
        this.rigRoot.visible = false;
        this.modelReady = true;
        this.modelLoading = false;
        this.modelMixer = new THREE.AnimationMixer(model);

        const jogForward = gltf.animations.find(clip => clip.name.toLowerCase() === 'jog forward');
        const walkClip = jogForward ? this.createReducedLocomotionClip(jogForward, 0.52) : null;

        for (const sourceClip of gltf.animations) {
          const clip = sourceClip.clone();
          clip.tracks = clip.tracks.filter(track => {
            const target = track.name.split('.')[0].toLowerCase();
            const property = track.name.split('.')[1] || '';
            // World movement owns character translation; animation must not move the player.
            return !(target.includes('hips') && property === 'position');
          });
          const action = this.modelMixer!.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.enabled = false;
          this.modelActions.set(sourceClip.name.toLowerCase(), action);
        }

        if (walkClip) {
          const walkAction = this.modelMixer!.clipAction(walkClip);
          walkAction.setLoop(THREE.LoopRepeat, Infinity);
          walkAction.enabled = false;
          this.modelActions.set('__walk_reduced', walkAction);
        }

        // Register semantic aliases only when the loaded asset really contains
        // a matching clip. This lets the same gameplay states work across rigs
        // whose exporters use different clip names (e.g. "Jog Forward" or "Run").
        const aliasFromClip = (alias: string, patterns: RegExp[], reject: RegExp[] = []) => {
          if (this.modelActions.has(alias)) return;
          const entry = [...this.modelActions.entries()].find(([name]) => {
            const n = name.toLowerCase();
            return patterns.some(pattern => pattern.test(n)) && !reject.some(pattern => pattern.test(n));
          });
          if (entry) this.modelActions.set(alias, entry[1]);
        };
        aliasFromClip('idle', [/(?:^|[| _-])idle(?:$|[ ._-])/, /idle neutral/, /standing idle/], [/walk/, /run/, /turn/]);
        aliasFromClip('walk', [/(?:^|[| _-])walk(?:$|[ ._-])/, /walk forward/, /walking/], [/backward/, /strafe/, /run/]);
        aliasFromClip('run', [/(?:^|[| _-])run(?:$|[ ._-])/, /jog forward/, /running/], [/backward/, /strafe/]);
        aliasFromClip('backward', [/backward/, /walk back/, /run back/, /reverse walk/]);
        aliasFromClip('strafe-left', [/strafe left/, /sidestep left/, /left strafe/]);
        aliasFromClip('strafe-right', [/strafe right/, /sidestep right/, /right strafe/]);
        aliasFromClip('jump', [/(?:^|[| _-])jump(?:$|[ ._-])/, /jumping/], [/jump attack/]);
        aliasFromClip('fall', [/falling/, /^fall(?:$|[ _-])/, /freefall/]);
        aliasFromClip('swim', [/(?:^|[| _-])swim(?:$|[ ._-])/, /swimming/]);
        aliasFromClip('crouch', [/crouch/, /sneak/]);
        aliasFromClip('gather', [/gather/, /harvest/, /chop/, /mine/, /interact/, /working/]);
        aliasFromClip('climb', [/climb/]);
        aliasFromClip('turn', [/turn left/, /turn right/, /turn in place/]);

        // The user-supplied Mixamo file contains one clip named "mixamo.com";
        // the source filename identifies it as a walking cycle.
        if (modelId === 'mixamo-walker' && gltf.animations.length === 1) {
          const walkAction = this.modelActions.get(gltf.animations[0].name.toLowerCase());
          if (walkAction) {
            this.modelActions.set('walk', walkAction);
            this.modelActions.set('run', walkAction);
          }
        }

        this.cacheMixamoBones(model);
        this.applyOutfit(this.currentOutfit);
        this.applyGender(this.gender);
        this.playModelAnimation('idle', 0);
        onLoaded?.();
      },
      undefined,
      error => {
        if (requestVersion !== this.modelRequestVersion) return;
        this.modelLoading = false;
        this.modelReady = false;
        this.rigRoot.visible = true;
        console.warn('[PlayerCharacter] Production GLB unavailable; using procedural fallback.', error);
      }
    );
  }

  /**
   * The source asset only has a jog cycle. Build a lighter walk cycle by
   * preserving the jog's first-frame standing pose and reducing every
   * rotational excursion toward that pose. This gives us a real walk state
   * without pretending the source "Idle" clip is usable.
   */
  private createReducedLocomotionClip(source: THREE.AnimationClip, amplitude: number) {
    const clip = source.clone();
    clip.name = '__walk_reduced';
    clip.tracks = clip.tracks.map(track => {
      if (!(track instanceof THREE.QuaternionKeyframeTrack)) return track.clone();

      const values = track.values.slice();
      if (values.length < 4) return track.clone();

      const base = values.slice(0, 4);
      for (let i = 0; i < values.length; i += 4) {
        const q = new THREE.Quaternion(values[i], values[i + 1], values[i + 2], values[i + 3]);
        const b = new THREE.Quaternion(base[0], base[1], base[2], base[3]);
        q.slerp(b, 1 - amplitude);
        values[i] = q.x;
        values[i + 1] = q.y;
        values[i + 2] = q.z;
        values[i + 3] = q.w;
      }
      return new THREE.QuaternionKeyframeTrack(track.name, track.times.slice(), values);
    });
    return clip;
  }

  private cacheMixamoBones(root: THREE.Object3D) {
    const find = (...names: string[]) => {
      for (const n of names) {
        const b = root.getObjectByName(n);
        if (b) return b;
      }
      return undefined;
    };
    this.mixamoBones = {
      hips: find('mixamorig:Hips', 'mixamorigHips', 'Hips'),
      spine: find('mixamorig:Spine', 'mixamorigSpine', 'Spine', 'Spine_01', 'Spine.001'),
      spine1: find('mixamorig:Spine1', 'mixamorigSpine1', 'Spine1', 'Spine_02', 'Spine.002'),
      spine2: find('mixamorig:Spine2', 'mixamorigSpine2', 'Spine2', 'Spine_03', 'Spine.003'),
      neck: find('mixamorig:Neck', 'mixamorigNeck', 'Neck'),
      head: find('mixamorig:Head', 'mixamorigHead', 'Head'),
      leftUpLeg: find('mixamorig:LeftUpLeg', 'mixamorigLeftUpLeg', 'LeftUpLeg', 'UpperLeg.L', 'UpperLeg_L'),
      leftLeg: find('mixamorig:LeftLeg', 'mixamorigLeftLeg', 'LeftLeg', 'LowerLeg.L', 'LowerLeg_L'),
      leftFoot: find('mixamorig:LeftFoot', 'mixamorigLeftFoot', 'LeftFoot', 'Foot.L', 'Foot_L'),
      rightUpLeg: find('mixamorig:RightUpLeg', 'mixamorigRightUpLeg', 'RightUpLeg', 'UpperLeg.R', 'UpperLeg_R'),
      rightLeg: find('mixamorig:RightLeg', 'mixamorigRightLeg', 'RightLeg', 'LowerLeg.R', 'LowerLeg_R'),
      rightFoot: find('mixamorig:RightFoot', 'mixamorigRightFoot', 'RightFoot', 'Foot.R', 'Foot_R'),
      leftArm: find('mixamorig:LeftArm', 'mixamorigLeftArm', 'LeftArm', 'UpperArm.L', 'UpperArm_L'),
      leftForeArm: find('mixamorig:LeftForeArm', 'mixamorigLeftForeArm', 'LeftForeArm', 'LowerArm.L', 'LowerArm_L'),
      rightArm: find('mixamorig:RightArm', 'mixamorigRightArm', 'RightArm', 'UpperArm.R', 'UpperArm_R'),
      rightForeArm: find('mixamorig:RightForeArm', 'mixamorigRightForeArm', 'RightForeArm', 'LowerArm.R', 'LowerArm_R'),
    };
    this.restBoneRotations.clear();
    for (const [key, bone] of Object.entries(this.mixamoBones)) {
      if (bone) this.restBoneRotations.set(key, bone.rotation.clone());
    }
    this.swimPoseBaseRotations.clear();
  }

  private applyProductionSwimPose(t: number, dt: number) {
    const bones = this.mixamoBones;
    if (!this.wasSwimming) {
      this.swimPoseBaseRotations.clear();
      for (const [key, bone] of Object.entries(bones)) {
        if (bone) this.swimPoseBaseRotations.set(key, bone.rotation.clone());
      }
      this.wasSwimming = true;
    }

    const offset = (key: string, bone: THREE.Object3D | undefined, x: number, z = 0) => {
      if (!bone) return;
      const base = this.swimPoseBaseRotations.get(key) ?? this.restBoneRotations.get(key) ?? bone.rotation;
      const blend = Math.min(1, dt * 12);
      bone.rotation.x = lerp(bone.rotation.x, base.x + x, blend);
      bone.rotation.z = lerp(bone.rotation.z, base.z + z, blend);
    };

    const sweep = 0.56 + Math.sin(t * 3.5) * 0.26;
    const kick = Math.sin(t * 4.2);
    offset('leftArm', bones.leftArm, -sweep, 0.07);
    offset('rightArm', bones.rightArm, -sweep, -0.07);
    offset('leftForeArm', bones.leftForeArm, 0.5);
    offset('rightForeArm', bones.rightForeArm, 0.5);
    offset('leftUpLeg', bones.leftUpLeg, kick * 0.14);
    offset('rightUpLeg', bones.rightUpLeg, -kick * 0.14);
    offset('leftLeg', bones.leftLeg, 0.2 + Math.max(0, -kick) * 0.13);
    offset('rightLeg', bones.rightLeg, 0.2 + Math.max(0, kick) * 0.13);
    offset('spine', bones.spine, 0.05);
  }

  private applyAirbornePose(velocityY: number, dt: number) {
    const b = this.mixamoBones;
    const rise = clamp(velocityY / 8.5, -1, 1);
    const lift = clamp(0.22 + Math.max(0, rise) * 0.12, 0.18, 0.34);
    const fall = clamp(Math.max(0, -rise), 0, 1);

    // Airborne pose is deliberately open and extended. The old implementation
    // tucked both thighs/knees aggressively, which visually read as crouching.
    if (b.hips) {
      b.hips.rotation.x = lerp(b.hips.rotation.x, -0.03 - fall * 0.04, Math.min(1, dt * 12));
    }
    if (b.spine) b.spine.rotation.x = lerp(b.spine.rotation.x, 0.02 + fall * 0.04, Math.min(1, dt * 10));
    if (b.spine1) b.spine1.rotation.x = lerp(b.spine1.rotation.x, 0.015, Math.min(1, dt * 10));
    if (b.spine2) b.spine2.rotation.x = lerp(b.spine2.rotation.x, 0.01, Math.min(1, dt * 10));

    if (b.leftArm) {
      b.leftArm.rotation.x = lerp(b.leftArm.rotation.x, -lift, Math.min(1, dt * 10));
      b.leftArm.rotation.z = lerp(b.leftArm.rotation.z, 0.16, Math.min(1, dt * 10));
    }
    if (b.rightArm) {
      b.rightArm.rotation.x = lerp(b.rightArm.rotation.x, -lift, Math.min(1, dt * 10));
      b.rightArm.rotation.z = lerp(b.rightArm.rotation.z, -0.16, Math.min(1, dt * 10));
    }
    if (b.leftForeArm) b.leftForeArm.rotation.x = lerp(b.leftForeArm.rotation.x, 0.18, Math.min(1, dt * 10));
    if (b.rightForeArm) b.rightForeArm.rotation.x = lerp(b.rightForeArm.rotation.x, 0.18, Math.min(1, dt * 10));

    const knee = 0.12 + fall * 0.10;
    if (b.leftUpLeg) b.leftUpLeg.rotation.x = lerp(b.leftUpLeg.rotation.x, 0.03, Math.min(1, dt * 10));
    if (b.rightUpLeg) b.rightUpLeg.rotation.x = lerp(b.rightUpLeg.rotation.x, 0.03, Math.min(1, dt * 10));
    if (b.leftLeg) b.leftLeg.rotation.x = lerp(b.leftLeg.rotation.x, knee, Math.min(1, dt * 10));
    if (b.rightLeg) b.rightLeg.rotation.x = lerp(b.rightLeg.rotation.x, knee, Math.min(1, dt * 10));
    if (b.leftFoot) b.leftFoot.rotation.x = lerp(b.leftFoot.rotation.x, -0.08, Math.min(1, dt * 8));
    if (b.rightFoot) b.rightFoot.rotation.x = lerp(b.rightFoot.rotation.x, -0.08, Math.min(1, dt * 8));
  }

  private relaxJumpBones(dt: number) {
    const rate = Math.min(1, dt * 8);
    for (const [key, bone] of Object.entries(this.mixamoBones)) {
      if (!bone) continue;
      const rest = this.restBoneRotations.get(key);
      if (!rest) continue;
      bone.rotation.x = lerp(bone.rotation.x, rest.x, rate);
      bone.rotation.y = lerp(bone.rotation.y, rest.y, rate);
      bone.rotation.z = lerp(bone.rotation.z, rest.z, rate);
    }
    if (this.mixamoBones.hips) {
      this.mixamoBones.hips.position.y = lerp(this.mixamoBones.hips.position.y, 0, rate);
    }
  }

  private findModelAction(name: string): THREE.AnimationAction | null {
    const target = name.toLowerCase();
    const exact = this.modelActions.get(target);
    if (exact) return exact;
    for (const [key, action] of this.modelActions) {
      if (key.includes(target) || target.includes(key)) return action;
    }
    return null;
  }

  private playModelAnimation(name: 'idle' | 'walk' | 'run' | 'backward' | 'strafe-left' | 'strafe-right' | 'jump' | 'fall' | 'swim' | 'crouch' | 'gather' | 'climb' | 'turn' | 'emote', fade = 0.14) {
    if (!this.modelReady || !this.modelMixer) return;

    const emoteCandidates: Record<EmoteKind, string[]> = {
      none: ['idle_neutral', 'idle'],
      wave: ['wave'],
      cheer: ['cheer', 'celebrate', 'jump'],
      sit: ['sit', 'sleep', 'idle_neutral', 'idle'],
      dance: ['dance', 'cheer', 'wave'],
      inspect: ['interact', 'working', 'inspect'],
    };
    const candidates = name === 'idle' ? ['idle_neutral', 'idle', '__walk_reduced', 'jog forward', 'walk', 'run']
      : name === 'walk' ? ['walk', '__walk_reduced', 'jog forward', 'run']
      : name === 'run' ? ['run', 'jog forward', 'walk']
      : name === 'backward' ? ['backward', 'jog backward', 'run_back', 'run backward', 'walk backward', 'walk', 'run']
      : name === 'strafe-left' ? ['strafe-left', 'strafe left', 'sidestep left', 'left strafe', 'walk']
      : name === 'strafe-right' ? ['strafe-right', 'strafe right', 'sidestep right', 'right strafe', 'walk']
      : name === 'jump' ? ['jump', 'jumping', 'idle_neutral', 'idle', 'walk', 'run']
      : name === 'fall' ? ['fall', 'falling', 'freefall', 'idle', 'walk']
      : name === 'swim' ? ['swim', 'swimming', 'idle_neutral', 'idle', 'walk']
      : name === 'crouch' ? ['crouch', 'sneak', 'idle']
      : name === 'gather' ? ['gather', 'harvest', 'chop', 'mine', 'interact', 'working', 'inspect', 'idle']
      : name === 'climb' ? ['climb', 'climbing', 'walk']
      : name === 'turn' ? ['turn', 'turn left', 'turn right', 'idle']
      : emoteCandidates[this.currentEmote] ?? ['idle'];

    let next: THREE.AnimationAction | null = null;
    let matched = '';
    for (const candidate of candidates) {
      next = this.findModelAction(candidate);
      if (next) {
        matched = candidate;
        break;
      }
    }
    if (!next) return;

    const isOneShotClip = name === 'jump' && /^(jump|jumping)/.test(matched);
    const freezeForIdle = name === 'idle' && !matched.startsWith('idle');
    const timeScale = name === 'run' ? 1.12
      : name === 'walk' ? (matched === 'run' ? 0.66 : matched === 'jog forward' ? 0.72 : 0.82)
      : name === 'backward' || name === 'strafe-left' || name === 'strafe-right' ? 0.82
      : name === 'swim' ? 0.9
      : name === 'emote' ? 0.9
      : 1.0;

    if (next !== this.activeModelAction) {
      next.reset();
      next.enabled = true;
      next.paused = false;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(timeScale);
      next.setLoop(isOneShotClip ? THREE.LoopOnce : THREE.LoopRepeat, isOneShotClip ? 1 : Infinity);
      next.clampWhenFinished = isOneShotClip;
      next.play();

      if (this.activeModelAction) {
        this.activeModelAction.crossFadeTo(next, fade, false);
      }
      this.activeModelAction = next;
    } else {
      next.setEffectiveTimeScale(timeScale);
      next.setEffectiveWeight(1);
      next.setLoop(isOneShotClip ? THREE.LoopOnce : THREE.LoopRepeat, isOneShotClip ? 1 : Infinity);
      next.clampWhenFinished = isOneShotClip;
    }

    // Use real idle clips where present. If a model only provides locomotion,
    // freeze its first frame rather than looping a walk while standing still.
    if (freezeForIdle) {
      next.paused = true;
      next.time = 0;
    } else if (!isOneShotClip) {
      next.paused = false;
    }

    this.modelAnimation = name;
    this.locomotionState = name === 'emote' ? 'emote' : name === 'jump' ? 'jump' : name;
  }

  private updateProductionAnimation(
    moving: boolean,
    sprinting: boolean,
    swimming: boolean,
    turnRate = 0,
    dt = 0.016,
    onGround = true,
    speed = 0,
    velocityY = 0,
    movementIntent: 'forward' | 'backward' | 'strafe-left' | 'strafe-right' = 'forward'
  ) {
    if (!this.modelReady || !this.modelRoot) return;

    if (swimming) {
      this.playModelAnimation('swim', 0.22);
      this.modelRoot.position.y = lerp(this.modelRoot.position.y, -0.32, Math.min(1, dt * 8));
      this.modelRoot.rotation.x = lerp(this.modelRoot.rotation.x, 1.25, Math.min(1, dt * 8));
      this.wasAirborne = false;
      return;
    }

    this.modelRoot.position.y = lerp(this.modelRoot.position.y, 0, Math.min(1, dt * 10));

    if (!onGround) {
      this.playModelAnimation(velocityY < -1.4 ? 'fall' : 'jump', 0.08);
      this.activeModelAction?.setEffectiveWeight(1);
      this.modelRoot.rotation.x = lerp(this.modelRoot.rotation.x, 0, Math.min(1, dt * 10));
      this.modelRoot.rotation.z = lerp(this.modelRoot.rotation.z, 0, Math.min(1, dt * 10));
      return;
    }

    if (this.wasAirborne) {
      this.landingTime = 0.16;
      this.triggerLanding(1);
      this.wasAirborne = false;
    }

    if (this.currentEmote !== 'none') {
      this.emoteTime += dt;
      if (this.emoteTime <= (this.currentEmote === 'inspect' ? 1.05 : 4.5)) {
        this.playModelAnimation('emote', 0.16);
        return;
      }
      this.currentEmote = 'none';
    }

    if (moving) {
      const hasDirectionalClip = movementIntent !== 'forward' && Boolean(this.findModelAction(movementIntent));
      if (hasDirectionalClip) {
        this.playModelAnimation(movementIntent);
      } else {
        this.playModelAnimation(sprinting || speed > 5.5 ? 'run' : 'walk');
      }
    } else {
      this.playModelAnimation('idle');
    }

    const forwardLean = moving ? (sprinting ? 0.10 : 0.035) : 0;
    const bankLean = moving ? clamp(-turnRate * 0.12, -0.09, 0.09) : 0;
    this.modelRoot.rotation.x = lerp(this.modelRoot.rotation.x, forwardLean, Math.min(1, dt * 8));
    this.modelRoot.rotation.z = lerp(this.modelRoot.rotation.z, bankLean, Math.min(1, dt * 8));

    if (this.landingTime > 0) {
      this.landingTime = Math.max(0, this.landingTime - dt);
      const amount = Math.sin((this.landingTime / 0.16) * Math.PI) * 0.045;
      this.modelRoot.scale.y = this.modelBaseScale * (1 - amount);
      this.modelRoot.scale.x = this.modelBaseScale * (1 + amount * 0.45);
      this.modelRoot.scale.z = this.modelBaseScale * (1 + amount * 0.45);
    } else {
      this.modelRoot.scale.y = lerp(this.modelRoot.scale.y, this.modelBaseScale, Math.min(1, dt * 14));
      this.modelRoot.scale.x = lerp(this.modelRoot.scale.x, this.modelBaseScale, Math.min(1, dt * 14));
      this.modelRoot.scale.z = lerp(this.modelRoot.scale.z, this.modelBaseScale, Math.min(1, dt * 14));
    }
  }

  setOutfit(kind: CharacterOutfitKind) { this.applyOutfit(kind); }
  setGender(gender: Gender) { this.applyGender(gender); }

  playEmote(emote: EmoteKind) {
    this.currentEmote = emote;
    this.emoteTime = 0;
  }

  applyOutfit(kind: CharacterOutfitKind) {
    this.currentOutfit = kind;
    const pal = OUTFIT_PALETTES[kind] || OUTFIT_PALETTES.explorer;
    for (const item of this.outfitMeshes) {
      const mat = item.mesh.material as THREE.MeshStandardMaterial;
      if (!mat) continue;
      if (item.part === 'tunic') mat.color.setHex(pal.tunic);
      else if (item.part === 'tunicTrim') mat.color.setHex(pal.tunicTrim);
      else if (item.part === 'pants') mat.color.setHex(pal.pants);
      else if (item.part === 'leather') mat.color.setHex(pal.leather);
      else if (item.part === 'boots') mat.color.setHex(pal.boots);
      else if (item.part === 'metal') mat.color.setHex(pal.metal);
      else if (item.part === 'accent') mat.color.setHex(pal.accent);
    }
  }

  applyGender(gender: Gender) {
    this.gender = gender;
    this.hairGroup.visible = true;
    this.hatGroup.visible = gender === 'male';
  }

  playJump() {
    this.landingSquash = 0;
    this.jumpAirTime = 0;
    this.jumpPoseActive = true;
    this.wasAirborne = true;
  }

  triggerLanding(intensity = 1.0) {
    this.landingSquash = Math.min(1.0, 0.12 * Math.abs(intensity));
    this.landingTime = 0.16;
  }

  animate(
    t: number,
    moving: boolean,
    sprinting: boolean,
    swimming: boolean,
    dt: number,
    speed: number,
    turnRate: number,
    onGround = true,
    velocityY = 0,
    movementIntent: 'forward' | 'backward' | 'strafe-left' | 'strafe-right' = 'forward'
  ) {
    if (!this.modelReady) {
      this.update(dt, t, moving, sprinting, swimming, speed, turnRate);
      return;
    }

    if (!onGround && !swimming) this.wasAirborne = true;

    this.updateProductionAnimation(moving, sprinting, swimming, turnRate, dt, onGround, speed, velocityY, movementIntent);
    this.modelMixer?.update(Math.min(dt, 0.05));

    if (swimming && !this.findModelAction('swim') && !this.findModelAction('swimming')) {
      this.applyProductionSwimPose(t, dt);
    } else if (!swimming && this.wasSwimming) {
      this.wasSwimming = false;
      this.swimPoseBaseRotations.clear();
    }

    // Bone overrides happen AFTER the mixer so the jump pose is not erased by
    // the animation system on the same frame.
    if (!onGround && !swimming) {
      if (this.findModelAction(velocityY < -1.4 ? 'fall' : 'jump')) {
        this.jumpPoseActive = false;
      } else {
        this.applyAirbornePose(velocityY, dt);
      }
    } else if (onGround && this.jumpPoseActive) {
      this.relaxJumpBones(dt);
      if (this.landingTime <= 0) this.jumpPoseActive = false;
    }
  }

  update(
    dt: number,
    t: number,
    moving: boolean,
    sprinting: boolean,
    swimming: boolean,
    speed: number,
    turnRate: number
  ) {
    if (this.landingSquash > 0) this.landingSquash = Math.max(0, this.landingSquash - dt * 4.5);
    const isEmoting = this.currentEmote !== 'none';
    if (isEmoting) {
      this.emoteTime += dt;
      if (this.emoteTime > 4.5) this.currentEmote = 'none';
    }
    const stepFreq = sprinting ? 11.5 : Math.max(5.5, speed * 1.4);
    if (moving && !swimming && !isEmoting) {
      this.walkPhase += dt * stepFreq;
      this.locomotionBlend = lerp(this.locomotionBlend, 1.0, Math.min(1, dt * 10));
    } else {
      this.locomotionBlend = lerp(this.locomotionBlend, 0.0, Math.min(1, dt * 8));
    }
    const blend = this.locomotionBlend;
    const phase = this.walkPhase;
    if (swimming) {
      this.resetLimbsToNeutral();
      const stroke = Math.sin(t * 4.2);
      this.leftUpperArm.rotation.x = -0.9 + stroke * 0.55;
      this.rightUpperArm.rotation.x = -0.9 - stroke * 0.55;
      this.leftForearm.rotation.x = 0.6;
      this.rightForearm.rotation.x = 0.6;
      this.leftThigh.rotation.x = stroke * 0.35;
      this.rightThigh.rotation.x = -stroke * 0.35;
      this.leftCalf.rotation.x = 0.4;
      this.rightCalf.rotation.x = 0.4;
      this.chest.rotation.x = 0.35;
      return;
    }
    if (isEmoting) {
      this.resetLimbsToNeutral();
      return;
    }
    const leftLegSwing = Math.sin(phase) * (sprinting ? 0.72 : 0.48);
    const rightLegSwing = Math.sin(phase + Math.PI) * (sprinting ? 0.72 : 0.48);
    this.leftThigh.rotation.x = lerp(0, leftLegSwing, blend);
    this.rightThigh.rotation.x = lerp(0, rightLegSwing, blend);
    const leftKnee = Math.max(0, -Math.sin(phase)) * (sprinting ? 0.95 : 0.55);
    const rightKnee = Math.max(0, -Math.sin(phase + Math.PI)) * (sprinting ? 0.95 : 0.55);
    this.leftCalf.rotation.x = lerp(0, leftKnee, blend);
    this.rightCalf.rotation.x = lerp(0, rightKnee, blend);
    this.leftFoot.rotation.x = lerp(0, -leftLegSwing * 0.35, blend);
    this.rightFoot.rotation.x = lerp(0, -rightLegSwing * 0.35, blend);
    const leftArmSwing = -leftLegSwing * 0.85;
    const rightArmSwing = -rightLegSwing * 0.85;
    const baseArmFlare = 0.12;
    this.leftUpperArm.rotation.z = baseArmFlare;
    this.rightUpperArm.rotation.z = -baseArmFlare;
    this.leftUpperArm.rotation.x = lerp(0.05 + Math.sin(t * 1.8) * 0.02, leftArmSwing, blend);
    this.rightUpperArm.rotation.x = lerp(0.05 + Math.sin(t * 1.8) * 0.02, rightArmSwing, blend);
    const leftElbowBend = 0.18 + Math.max(0, -leftArmSwing) * (sprinting ? 0.85 : 0.45);
    const rightElbowBend = 0.18 + Math.max(0, -rightArmSwing) * (sprinting ? 0.85 : 0.45);
    this.leftForearm.rotation.x = lerp(0.18, leftElbowBend, blend);
    this.rightForearm.rotation.x = lerp(0.18, rightElbowBend, blend);
    const verticalBounce = -Math.abs(Math.sin(phase)) * (sprinting ? 0.065 : 0.038);
    const hipRoll = Math.sin(phase) * (sprinting ? 0.055 : 0.035);
    this.pelvis.position.y = 0.92 + (moving ? verticalBounce : Math.sin(t * 2.0) * 0.012);
    this.pelvis.rotation.z = lerp(0, hipRoll, blend);
    this.pelvis.rotation.y = lerp(0, Math.sin(phase) * 0.08, blend);
    this.spine.rotation.y = lerp(0, -Math.sin(phase) * 0.07, blend);
    const forwardLean = moving ? (sprinting ? 0.22 : 0.08) : 0;
    const bankLean = moving ? clamp(-turnRate * 0.25, -0.16, 0.16) : 0;
    this.chest.rotation.x = lerp(0, forwardLean, blend);
    this.chest.rotation.z = lerp(0, bankLean, blend);
    this.head.rotation.y = lerp(0, Math.sin(phase) * 0.03, blend);
    this.head.rotation.z = lerp(0, -bankLean * 0.5, blend);
  }

  private resetLimbsToNeutral() {
    this.leftUpperArm.rotation.set(0, 0, 0.1);
    this.rightUpperArm.rotation.set(0, 0, -0.1);
    this.leftForearm.rotation.set(0.15, 0, 0);
    this.rightForearm.rotation.set(0.15, 0, 0);
    this.leftThigh.rotation.set(0, 0, 0);
    this.rightThigh.rotation.set(0, 0, 0);
    this.leftCalf.rotation.set(0, 0, 0);
    this.rightCalf.rotation.set(0, 0, 0);
    this.leftFoot.rotation.set(0, 0, 0);
    this.rightFoot.rotation.set(0, 0, 0);
    this.pelvis.position.set(0, 0.92, 0);
    this.pelvis.rotation.set(0, 0, 0);
    this.spine.rotation.set(0, 0, 0);
    this.chest.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
  }
}
