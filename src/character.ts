import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { EmoteKind, Gender } from './types';
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
    tunic: 0x2b6ca3, // Vibrant Azure Expedition Tunic
    tunicTrim: 0xf2c14e,
    pants: 0x3d352e, // Sturdy Khaki Trail Pants
    leather: 0x824d27, // Cognac Leather
    boots: 0x422817,
    metal: 0xe6b843, // Polished Brass
    accent: 0xf5ba42,
  },
  ranger: {
    tunic: 0x2e6b35, // Forest Emerald Ranger Coat
    tunicTrim: 0xb5954e,
    pants: 0x332c25,
    leather: 0x734320,
    boots: 0x3d2716,
    metal: 0xa8c256,
    accent: 0xb5954e,
  },
  scout: {
    tunic: 0xc25a2b, // Desert Terracotta Tunic
    tunicTrim: 0xf0c85d,
    pants: 0x453e36,
    leather: 0x6e3c1d,
    boots: 0x3b2414,
    metal: 0xdeb841,
    accent: 0xf2cb61,
  },
  arctic: {
    tunic: 0x5486ad, // Glacial Blue Parka
    tunicTrim: 0xf0f5fa,
    pants: 0x2b3847,
    leather: 0x4a3b32,
    boots: 0x222a33,
    metal: 0xd9e5eb,
    accent: 0xffffff,
  },
  lagos: {
    tunic: 0x138a4b, // Vibrant Lagos Emerald Agbada/Tunic with Gold Filigree
    tunicTrim: 0xf5c027,
    pants: 0x1f2421, // Sleek Midnight Chinos
    leather: 0x8a5528,
    boots: 0x241810,
    metal: 0xf5ba2c, // Rich West African Gold
    accent: 0xf5c027,
  },
};

export class PlayerCharacter {
  root = new THREE.Group();
  velocity = new THREE.Vector3();
  onGround = true;
  swimming = false;

  // Visual Customization
  private gender: Gender = 'male';
  private currentOutfit: CharacterOutfitKind = 'explorer';

  // Procedural Skeletal Rig Components
  private rigRoot = new THREE.Group();
  private pelvis = new THREE.Group();
  private spine = new THREE.Group();
  private chest = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();

  // Limbs: Left & Right Arms
  private leftClavicle = new THREE.Group();
  private leftUpperArm = new THREE.Group();
  private leftForearm = new THREE.Group();
  private leftHand = new THREE.Group();

  private rightClavicle = new THREE.Group();
  private rightUpperArm = new THREE.Group();
  private rightForearm = new THREE.Group();
  private rightHand = new THREE.Group();

  // Limbs: Left & Right Legs
  private leftHip = new THREE.Group();
  private leftThigh = new THREE.Group();
  private leftCalf = new THREE.Group();
  private leftFoot = new THREE.Group();

  private rightHip = new THREE.Group();
  private rightThigh = new THREE.Group();
  private rightCalf = new THREE.Group();
  private rightFoot = new THREE.Group();

  // Headwear & Hair Groups (swapped by gender)
  private hairGroup = new THREE.Group();
  private hatGroup = new THREE.Group();

  // Dynamic Outfit Mesh References for instant re-theming
  private outfitMeshes: {
    mesh: THREE.Mesh;
    part: 'tunic' | 'tunicTrim' | 'pants' | 'leather' | 'boots' | 'metal' | 'accent';
  }[] = [];

  // Dedicated Character Lighting
  private charKeyLight: THREE.PointLight;
  private charFillLight: THREE.PointLight;

  // Animation State
  private walkPhase = 0;
  private locomotionBlend = 0;
  private landingSquash = 0;
  private currentEmote: EmoteKind = 'none';
  private emoteTime = 0;

  // Production character asset. The procedural rig remains as a fallback until the
  // uploaded Mixamo-style GLB is available, so a missing asset can never blank the game.
  private modelRoot: THREE.Group | null = null;
  private modelMixer: THREE.AnimationMixer | null = null;
  private modelActions = new Map<string, THREE.AnimationAction>();
  private activeModelAction: THREE.AnimationAction | null = null;
  private modelReady = false;
  private modelAnimation = '';

  constructor(lowPowerMode: boolean, onLoaded?: () => void) {
    this.root.name = 'player-character-rig';

    // 1. DEDICATED CHARACTER LIGHTING: Illuminates face and hands from front
    this.charKeyLight = new THREE.PointLight(0xfff7ea, 2.2, 5.5);
    this.charKeyLight.position.set(0, 1.6, 1.2);
    this.root.add(this.charKeyLight);

    this.charFillLight = new THREE.PointLight(0xdceeff, 1.4, 4.5);
    this.charFillLight.position.set(-0.6, 1.2, -0.8);
    this.root.add(this.charFillLight);

    // 2. BUILD ARTICULATED SKELETAL RIG
    this.buildSkeletalHierarchy();
    this.buildAnatomicalModel(lowPowerMode);

    this.applyOutfit(this.currentOutfit);
    this.applyGender(this.gender);
    this.loadProductionModel(onLoaded);

    if (onLoaded) {
      setTimeout(onLoaded, 50);
    }
  }

  private buildSkeletalHierarchy() {
    this.rigRoot.name = 'rig-root';
    this.root.add(this.rigRoot);

    // Pelvis / Hips (pivot at base of torso, y=0.92m)
    this.pelvis.name = 'bone-pelvis';
    this.pelvis.position.set(0, 0.92, 0);
    this.rigRoot.add(this.pelvis);

    // Spine
    this.spine.name = 'bone-spine';
    this.spine.position.set(0, 0.16, 0);
    this.pelvis.add(this.spine);

    // Chest / Upper Torso
    this.chest.name = 'bone-chest';
    this.chest.position.set(0, 0.22, 0);
    this.spine.add(this.chest);

    // Neck
    this.neck.name = 'bone-neck';
    this.neck.position.set(0, 0.24, 0);
    this.chest.add(this.neck);

    // Head
    this.head.name = 'bone-head';
    this.head.position.set(0, 0.12, 0);
    this.neck.add(this.head);

    // Left Arm Hierarchy
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

    // Right Arm Hierarchy
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

    // Left Leg Hierarchy
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

    // Right Leg Hierarchy
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

    // Shared Materials
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xffd1b3, // Radiant, warm, glowing anime skin tone
      roughness: 0.52,
      metalness: 0.0,
      emissive: new THREE.Color(0x38261e), // Subtle warm bounce so face is NEVER black
    });

    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const irisMat = new THREE.MeshStandardMaterial({ color: 0x1b72a8, roughness: 0.25 }); // Deep sapphire iris
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
    const blushMat = new THREE.MeshStandardMaterial({ color: 0xf5988e, roughness: 0.8 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0xd95763, roughness: 0.5 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x3d2716, roughness: 0.75 }); // Rich chestnut hair

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
      if (role) {
        this.outfitMeshes.push({ mesh: m, part: role });
      }
      return m;
    };

    // --- 1. HEAD & EXPRESSIVE ANIME FACE ---
    // Smooth sculpted head
    const headGeo = new THREE.SphereGeometry(0.19, 14, 12);
    createMesh(headGeo, skinMat, this.head, [0, 0.08, 0], [0.92, 1.05, 0.98]);

    // Cute stylized anime chin/jaw
    const jawGeo = new THREE.ConeGeometry(0.12, 0.16, 8);
    const jaw = createMesh(jawGeo, skinMat, this.head, [0, -0.04, 0.04], [1, 1, 1]);
    jaw.rotation.x = Math.PI;

    // Expressive Eyes (Left & Right)
    for (const sx of [-1, 1]) {
      // Eye White (Sclera)
      createMesh(new THREE.BoxGeometry(0.065, 0.065, 0.02), eyeWhiteMat, this.head, [sx * 0.075, 0.08, 0.165]);
      // Colored Iris
      createMesh(new THREE.BoxGeometry(0.042, 0.052, 0.022), irisMat, this.head, [sx * 0.075, 0.08, 0.17]);
      // Pupil & Specular Catchlight
      createMesh(new THREE.BoxGeometry(0.022, 0.03, 0.024), pupilMat, this.head, [sx * 0.075, 0.08, 0.174]);
      createMesh(new THREE.SphereGeometry(0.009, 4, 4), eyeWhiteMat, this.head, [sx * 0.068, 0.092, 0.18]);
      // Cute Anime Blush on Cheeks
      createMesh(new THREE.BoxGeometry(0.05, 0.024, 0.01), blushMat, this.head, [sx * 0.09, 0.03, 0.162]);
      // Stylized Eyebrows
      createMesh(new THREE.BoxGeometry(0.065, 0.014, 0.02), hairMat, this.head, [sx * 0.075, 0.128, 0.165]);
    }

    // Friendly smile
    createMesh(new THREE.BoxGeometry(0.05, 0.016, 0.015), mouthMat, this.head, [0, -0.025, 0.165]);

    // Ears
    for (const sx of [-1, 1]) {
      createMesh(new THREE.BoxGeometry(0.028, 0.06, 0.04), skinMat, this.head, [sx * 0.18, 0.07, 0]);
    }

    // --- 2. HAIR & HEADWEAR (attached to head) ---
    this.head.add(this.hairGroup);
    this.head.add(this.hatGroup);

    // Base Hair Volume
    const hairCap = createMesh(new THREE.SphereGeometry(0.205, 12, 10), hairMat, this.hairGroup, [0, 0.1, -0.02], [1, 1.05, 1.05]);
    // Hair Bangs & Front Locks
    createMesh(new THREE.BoxGeometry(0.24, 0.08, 0.08), hairMat, this.hairGroup, [0, 0.18, 0.14]);
    createMesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), hairMat, this.hairGroup, [-0.12, 0.08, 0.12]);
    createMesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), hairMat, this.hairGroup, [0.12, 0.08, 0.12]);

    // Adventurer Leather Cap & Feather/Pin
    const hatCrown = createMesh(new THREE.CylinderGeometry(0.18, 0.22, 0.14, 10), leatherMat, this.hatGroup, [0, 0.2, -0.01], [1, 1, 1], 'leather');
    const hatBrim = createMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.025, 14), leatherMat, this.hatGroup, [0, 0.13, 0.02], [1, 1, 1], 'leather');
    const hatBand = createMesh(new THREE.CylinderGeometry(0.225, 0.225, 0.035, 10), brassMat, this.hatGroup, [0, 0.15, -0.01], [1, 1, 1], 'metal');
    const feather = createMesh(new THREE.ConeGeometry(0.04, 0.22, 4), trimMat, this.hatGroup, [0.18, 0.28, -0.01], [1, 1, 0.4], 'accent');
    feather.rotation.z = -0.35;

    // --- 3. TORSO, TUNIC, VEST & BELT ---
    // Neck collar
    createMesh(new THREE.CylinderGeometry(0.075, 0.085, 0.14, 8), skinMat, this.neck, [0, 0.04, 0]);

    // Chest & Upper Tunic
    const chestMesh = createMesh(new THREE.BoxGeometry(0.44, 0.32, 0.28), tunicMat, this.chest, [0, 0.02, 0], [1, 1, 1], 'tunic');
    // Leather Vest Overlay
    const vestMesh = createMesh(new THREE.BoxGeometry(0.46, 0.28, 0.3), leatherMat, this.chest, [0, 0.03, 0], [1, 1, 1], 'leather');
    // Gold Tunic Trim / Collar
    createMesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), trimMat, this.chest, [0, 0.12, 0], [1, 1, 1], 'tunicTrim');

    // Spine & Lower Torso
    createMesh(new THREE.BoxGeometry(0.4, 0.24, 0.26), tunicMat, this.spine, [0, -0.02, 0], [1, 1, 1], 'tunic');

    // Adventurer Belt with Stately Brass Buckle
    createMesh(new THREE.BoxGeometry(0.42, 0.08, 0.28), leatherMat, this.pelvis, [0, 0.04, 0], [1, 1, 1], 'leather');
    createMesh(new THREE.BoxGeometry(0.12, 0.1, 0.3), brassMat, this.pelvis, [0, 0.04, 0], [1, 1, 1], 'metal');
    // Belt Pouch
    createMesh(new THREE.BoxGeometry(0.12, 0.14, 0.1), leatherMat, this.pelvis, [0.22, 0.01, 0.04], [1, 1, 1], 'leather');

    // Pelvis & Hips (Pants upper)
    createMesh(new THREE.BoxGeometry(0.38, 0.18, 0.26), pantsMat, this.pelvis, [0, -0.08, 0], [1, 1, 1], 'pants');

    // Adventurer Expedition Backpack (attached to chest)
    const packBody = createMesh(new THREE.BoxGeometry(0.36, 0.44, 0.22), tunicMat, this.chest, [0, 0.02, -0.24], [1, 1, 1], 'tunic');
    const packFlap = createMesh(new THREE.BoxGeometry(0.38, 0.16, 0.24), leatherMat, this.chest, [0, 0.16, -0.24], [1, 1, 1], 'leather');
    const bedroll = createMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 8), leatherMat, this.chest, [0, 0.28, -0.24], [1, 1, 1], 'leather');
    bedroll.rotation.z = Math.PI / 2;

    // --- 4. ARMS & CLEARLY VISIBLE HANDS ---
    for (const [arm, side] of [[this.leftUpperArm, 1], [this.rightUpperArm, -1]] as const) {
      // Upper arm tunic sleeve
      createMesh(new THREE.CylinderGeometry(0.075, 0.07, 0.26, 8), tunicMat, arm, [0, -0.13, 0], [1, 1, 1], 'tunic');
      // Sleeve cuff
      createMesh(new THREE.CylinderGeometry(0.082, 0.082, 0.05, 8), trimMat, arm, [0, -0.25, 0], [1, 1, 1], 'tunicTrim');
    }

    for (const forearm of [this.leftForearm, this.rightForearm]) {
      // Forearm with visible skin & leather bracer
      createMesh(new THREE.CylinderGeometry(0.065, 0.055, 0.24, 8), skinMat, forearm, [0, -0.12, 0]);
      createMesh(new THREE.CylinderGeometry(0.072, 0.062, 0.14, 8), leatherMat, forearm, [0, -0.12, 0], [1, 1, 1], 'leather');
    }

    for (const hand of [this.leftHand, this.rightHand]) {
      // Clear, bright, visible hands with palm and thumb
      createMesh(new THREE.BoxGeometry(0.075, 0.11, 0.055), skinMat, hand, [0, -0.05, 0]);
      // Thumb
      createMesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), skinMat, hand, [0.035, -0.03, 0.02]);
      // Finger tips
      createMesh(new THREE.BoxGeometry(0.068, 0.035, 0.045), skinMat, hand, [0, -0.115, 0]);
    }

    // --- 5. LEGS & STURDY TRAVEL BOOTS ---
    for (const thigh of [this.leftThigh, this.rightThigh]) {
      createMesh(new THREE.CylinderGeometry(0.09, 0.08, 0.4, 8), pantsMat, thigh, [0, -0.2, 0], [1, 1, 1], 'pants');
    }

    for (const calf of [this.leftCalf, this.rightCalf]) {
      createMesh(new THREE.CylinderGeometry(0.08, 0.075, 0.22, 8), pantsMat, calf, [0, -0.11, 0], [1, 1, 1], 'pants');
      // High travel boot shaft
      createMesh(new THREE.CylinderGeometry(0.085, 0.08, 0.24, 8), bootsMat, calf, [0, -0.28, 0], [1, 1, 1], 'boots');
    }

    for (const foot of [this.leftFoot, this.rightFoot]) {
      // Boot foot & sturdy tread
      createMesh(new THREE.BoxGeometry(0.12, 0.09, 0.24), bootsMat, foot, [0, -0.04, 0.04], [1, 1, 1], 'boots');
      createMesh(new THREE.BoxGeometry(0.13, 0.035, 0.25), leatherMat, foot, [0, -0.08, 0.04], [1, 1, 1], 'leather');
    }
  }

  private loadProductionModel(onLoaded?: () => void) {
    const loader = new GLTFLoader();
    loader.load(
      '/assets/rigged-model.glb',
      gltf => {
        const model = gltf.scene;
        model.name = 'player-production-model';

        // The exported asset's armature carries a +90° X conversion rotation.
        // The game already uses Three.js Y-up world coordinates, so keeping that
        // export-space rotation makes the character lie on its back. Counter it
        // once at the model root; the Mixamo skeleton/animations then stay upright.
        model.rotation.x = -Math.PI / 2;
        model.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
            object.frustumCulled = true;
          }
        });

        // Normalize the source asset to the game's existing ~1.8m character scale.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const height = Math.max(size.y, 0.001);
        const scale = 1.78 / height;
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(model);
        model.position.y -= scaledBox.min.y;

        this.modelRoot = model;
        this.root.add(model);
        this.rigRoot.visible = false;
        this.modelReady = true;

        this.modelMixer = new THREE.AnimationMixer(model);
        for (const sourceClip of gltf.animations) {
          // Remove hip/root translation so animation does not fight the game's
          // own collision-driven player movement. The body/leg motion remains intact.
          const clip = sourceClip.clone();
          clip.tracks = clip.tracks.filter(track => {
            const target = track.name.split('.')[0].toLowerCase();
            const property = track.name.split('.')[1] || '';
            return !(target.includes('hips') && property === 'position');
          });
          const action = this.modelMixer!.clipAction(clip);
          action.enabled = false;
          action.setLoop(THREE.LoopRepeat, Infinity);
          this.modelActions.set(sourceClip.name.toLowerCase(), action);
        }

        this.playModelAnimation('idle', 0);
        onLoaded?.();
      },
      undefined,
      error => {
        console.warn('[PlayerCharacter] Production GLB unavailable; using procedural fallback.', error);
      }
    );
  }

  private findModelAction(name: string) {
    const exact = this.modelActions.get(name.toLowerCase());
    if (exact) return exact;
    for (const [key, action] of this.modelActions) {
      if (key.includes(name.toLowerCase())) return action;
    }
    return null;
  }

  private playModelAnimation(name: 'idle' | 'walk' | 'run' | 'backward', fade = 0.16) {
    if (!this.modelReady || !this.modelMixer) return;
    const lookup = name === 'walk' || name === 'run' ? 'jog forward' : name === 'backward' ? 'jog backward' : 'idle';
    const next = this.findModelAction(lookup) || this.findModelAction(name) || this.findModelAction('idle');
    if (!next || next === this.activeModelAction) {
      if (next) next.setEffectiveTimeScale(name === 'run' ? 1.0 : name === 'walk' ? 0.62 : 1.0);
      return;
    }
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(name === 'run' ? 1.05 : name === 'walk' ? 0.62 : 1.0);
    if (this.activeModelAction) {
      this.activeModelAction.crossFadeTo(next, fade, true);
    } else {
      next.play();
    }
    this.activeModelAction = next;
    this.modelAnimation = name;
  }

  private updateProductionAnimation(moving: boolean, sprinting: boolean, swimming: boolean) {
    if (!this.modelReady || !this.modelMixer) return;
    if (swimming) {
      // No swimming clip was purchased, so keep the character readable while the
      // existing game swimming state controls the body/camera.
      this.playModelAnimation('idle', 0.25);
    } else if (moving) {
      this.playModelAnimation(sprinting ? 'run' : 'walk');
    } else {
      this.playModelAnimation('idle');
    }
  }

  // --- OUTFIT & GENDER CUSTOMIZATION ---
  setOutfit(kind: CharacterOutfitKind) {
    this.applyOutfit(kind);
  }

  setGender(gender: Gender) {
    this.applyGender(gender);
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
    // Adjust silhouette: Female has slightly narrower shoulders, graceful hair ponytail/bangs
    if (gender === 'female') {
      this.chest.scale.set(0.92, 1.0, 0.94);
      this.pelvis.scale.set(1.05, 1.0, 1.02);
      this.hatGroup.visible = false;
      this.hairGroup.scale.set(1.04, 1.06, 1.04);
    } else {
      this.chest.scale.set(1.0, 1.0, 1.0);
      this.pelvis.scale.set(1.0, 1.0, 1.0);
      this.hatGroup.visible = true;
      this.hairGroup.scale.set(1.0, 1.0, 1.0);
    }
  }

  playEmote(emote: EmoteKind) {
    this.currentEmote = emote;
    this.emoteTime = 0;
  }

  playJump() {
    this.landingSquash = 0.35;
  }

  triggerLanding(intensity = 1.0) {
    this.landingSquash = Math.min(1.0, 0.35 * Math.abs(intensity));
  }

  animate(
    t: number,
    moving: boolean,
    sprinting: boolean,
    swimming: boolean,
    dt: number,
    speed: number,
    turnRate: number
  ) {
    this.update(dt, t, moving, sprinting, swimming, speed, turnRate);
    this.updateProductionAnimation(moving, sprinting, swimming);
    this.modelMixer?.update(Math.min(dt, 1 / 20));
  }

  // --- NATURAL CONTRALATERAL HUMAN WALKING & LOCOMOTION ENGINE ---
  update(
    dt: number,
    t: number,
    moving: boolean,
    sprinting: boolean,
    swimming: boolean,
    speed: number,
    turnRate: number
  ) {
    if (this.landingSquash > 0) {
      this.landingSquash = Math.max(0, this.landingSquash - dt * 4.5);
    }

    const isEmoting = this.currentEmote !== 'none';
    if (isEmoting) {
      this.emoteTime += dt;
      if (this.emoteTime > 4.5) {
        this.currentEmote = 'none';
      }
    }

    // Advance locomotion cycle with actual displacement speed
    const stepFreq = sprinting ? 11.5 : Math.max(5.5, speed * 1.4);
    if (moving && !swimming && !isEmoting) {
      this.walkPhase += dt * stepFreq;
      this.locomotionBlend = lerp(this.locomotionBlend, 1.0, Math.min(1, dt * 10));
    } else {
      this.locomotionBlend = lerp(this.locomotionBlend, 0.0, Math.min(1, dt * 8));
    }

    const blend = this.locomotionBlend;
    const phase = this.walkPhase;

    // --- SWIMMING POSE & STROKES ---
    if (swimming) {
      this.rigRoot.rotation.x = lerp(this.rigRoot.rotation.x, 1.35, Math.min(1, dt * 8));
      this.rigRoot.position.y = -0.25 + Math.sin(t * 3.0) * 0.03;

      // Breaststroke / freestyle alternating arm strokes
      const swimPhase = t * 4.0;
      this.leftUpperArm.rotation.x = Math.sin(swimPhase) * 0.85;
      this.rightUpperArm.rotation.x = Math.sin(swimPhase + Math.PI) * 0.85;
      this.leftForearm.rotation.x = 0.5 + Math.max(0, Math.sin(swimPhase)) * 0.6;
      this.rightForearm.rotation.x = 0.5 + Math.max(0, Math.sin(swimPhase + Math.PI)) * 0.6;

      // Flutter kick legs
      this.leftThigh.rotation.x = Math.sin(swimPhase * 1.5) * 0.45;
      this.rightThigh.rotation.x = Math.sin(swimPhase * 1.5 + Math.PI) * 0.45;
      this.leftCalf.rotation.x = 0.2 + Math.max(0, -Math.sin(swimPhase * 1.5)) * 0.4;
      this.rightCalf.rotation.x = 0.2 + Math.max(0, Math.sin(swimPhase * 1.5)) * 0.4;
      return;
    }

    // Reset swim rotation when on land
    this.rigRoot.rotation.x = lerp(this.rigRoot.rotation.x, 0, Math.min(1, dt * 10));

    // --- EMOTES ---
    if (isEmoting) {
      this.resetLimbsToNeutral();
      if (this.currentEmote === 'wave') {
        // Right hand waves high above shoulder!
        this.rightUpperArm.rotation.set(-2.4, 0, -0.6);
        this.rightForearm.rotation.set(-0.5, 0, Math.sin(this.emoteTime * 7.0) * 0.5);
        this.head.rotation.y = -0.15;
      } else if (this.currentEmote === 'cheer') {
        // Both arms raised high celebrating!
        const pump = Math.sin(this.emoteTime * 6.5) * 0.35;
        this.leftUpperArm.rotation.set(-2.5 + pump, 0, 0.4);
        this.rightUpperArm.rotation.set(-2.5 + pump, 0, -0.4);
        this.pelvis.position.y = 0.92 + Math.max(0, Math.sin(this.emoteTime * 6.5)) * 0.12;
      } else if (this.currentEmote === 'dance') {
        this.pelvis.position.y = 0.92 + Math.abs(Math.sin(this.emoteTime * 5.0)) * 0.08;
        this.pelvis.rotation.y = Math.sin(this.emoteTime * 3.5) * 0.35;
        this.leftUpperArm.rotation.x = Math.sin(this.emoteTime * 5.0) * 0.5;
        this.rightUpperArm.rotation.x = -Math.sin(this.emoteTime * 5.0) * 0.5;
      } else if (this.currentEmote === 'sit') {
        this.pelvis.position.y = 0.48;
        this.leftThigh.rotation.x = -1.45;
        this.rightThigh.rotation.x = -1.45;
        this.leftCalf.rotation.x = 1.45;
        this.rightCalf.rotation.x = 1.45;
        this.leftUpperArm.rotation.x = 0.2;
        this.rightUpperArm.rotation.x = 0.2;
      } else if (this.currentEmote === 'inspect') {
        this.spine.rotation.x = 0.45;
        this.head.rotation.x = 0.35;
        this.rightUpperArm.rotation.x = -0.6;
        this.rightForearm.rotation.x = 0.8;
      }
      return;
    }

    // --- NATURAL CONTRALATERAL HUMAN WALKING CYCLE ---
    const strideLength = sprinting ? 0.95 : 0.65;
    const armSwingAmp = sprinting ? 0.92 : 0.62;

    // 1. LEGS: STEPPING ONE AFTER THE OTHER
    // Left leg swings forward when right leg swings back
    const leftLegSwing = Math.sin(phase) * strideLength;
    const rightLegSwing = -Math.sin(phase) * strideLength;

    // Knee flexion: bends backward during swing phase
    const leftKneeBend = Math.max(0, -Math.sin(phase)) * (sprinting ? 1.25 : 0.85);
    const rightKneeBend = Math.max(0, Math.sin(phase)) * (sprinting ? 1.25 : 0.85);

    this.leftThigh.rotation.x = lerp(0, leftLegSwing, blend);
    this.rightThigh.rotation.x = lerp(0, rightLegSwing, blend);

    this.leftCalf.rotation.x = lerp(0, leftKneeBend, blend);
    this.rightCalf.rotation.x = lerp(0, rightKneeBend, blend);

    // Foot ankle flexion for smooth toe-off and heel strike
    this.leftFoot.rotation.x = lerp(0, -leftLegSwing * 0.35, blend);
    this.rightFoot.rotation.x = lerp(0, -rightLegSwing * 0.35, blend);

    // 2. UPPER LIMBS (ARMS): CONTRALATERAL HUMAN OPPOSITION
    // Right arm swings FORWARD when Left leg swings forward!
    // Left arm swings FORWARD when Right leg swings forward!
    const rightArmSwing = Math.sin(phase) * armSwingAmp;
    const leftArmSwing = -Math.sin(phase) * armSwingAmp;

    // Natural arm relaxation at side (outward flare 0.1 rad, slight elbow curve)
    const baseArmFlare = 0.12;
    this.leftUpperArm.rotation.z = baseArmFlare;
    this.rightUpperArm.rotation.z = -baseArmFlare;

    this.leftUpperArm.rotation.x = lerp(0.05 + Math.sin(t * 1.8) * 0.02, leftArmSwing, blend);
    this.rightUpperArm.rotation.x = lerp(0.05 + Math.sin(t * 1.8) * 0.02, rightArmSwing, blend);

    // Elbows bend forward as arm drives forward
    const leftElbowBend = 0.18 + Math.max(0, -leftArmSwing) * (sprinting ? 0.85 : 0.45);
    const rightElbowBend = 0.18 + Math.max(0, -rightArmSwing) * (sprinting ? 0.85 : 0.45);

    this.leftForearm.rotation.x = lerp(0.18, leftElbowBend, blend);
    this.rightForearm.rotation.x = lerp(0.18, rightElbowBend, blend);

    // 3. PELVIS BOUNCE, SWAY & HIP ROLL
    // Double-dip vertical bounce per cycle (lowest at foot plant, highest at passing)
    const verticalBounce = -Math.abs(Math.sin(phase)) * (sprinting ? 0.065 : 0.038);
    const hipRoll = Math.sin(phase) * (sprinting ? 0.055 : 0.035);

    this.pelvis.position.y = 0.92 + (moving ? verticalBounce : Math.sin(t * 2.0) * 0.012);
    this.pelvis.rotation.z = lerp(0, hipRoll, blend);
    this.pelvis.rotation.y = lerp(0, Math.sin(phase) * 0.08, blend);

    // 4. TORSO & SPINE COUNTER-TWIST (Shoulders counter-rotate against hips)
    this.spine.rotation.y = lerp(0, -Math.sin(phase) * 0.07, blend);
    // Torso lean: athletic forward pitch when moving/sprinting
    const forwardLean = moving ? (sprinting ? 0.22 : 0.08) : 0;
    const bankLean = moving ? clamp(-turnRate * 0.25, -0.16, 0.16) : 0;
    this.chest.rotation.x = lerp(0, forwardLean, blend);
    this.chest.rotation.z = lerp(0, bankLean, blend);

    // 5. HEAD STABILIZATION: Head counter-stabilizes to stay level
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
