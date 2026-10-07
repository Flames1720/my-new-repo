import * as THREE from 'three';
import type { EmoteKind } from './types';
import { clamp, lerp } from './terrain';

export type CharacterOutfitKind = 'explorer' | 'ranger' | 'scout' | 'arctic';

export const OUTFIT_PALETTES: Record<CharacterOutfitKind, { tunic: number; pants: number; leather: number; accent: number }> = {
  explorer: { tunic: 0x2b4c68, pants: 0x3d352e, leather: 0x6e4324, accent: 0xd4a046 },
  ranger: { tunic: 0x284729, pants: 0x2c2621, leather: 0x5a341a, accent: 0x937840 },
  scout: { tunic: 0x8a4522, pants: 0x383533, leather: 0x522f18, accent: 0xd9b35b },
  arctic: { tunic: 0x415b6d, pants: 0x24323d, leather: 0x332822, accent: 0xe6eef2 },
};

export class PlayerCharacter {
  root = new THREE.Group();
  velocity = new THREE.Vector3();
  onGround = true;
  swimming = false;

  private fallback: THREE.Group;
  avatar: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private activeAction: THREE.AnimationAction | null = null;
  private oneShot = false;

  // Bones for procedural IK and Emotes
  private headBone: THREE.Object3D | null = null;
  private spineBone: THREE.Object3D | null = null;
  private chestBone: THREE.Object3D | null = null;
  private leftUpperArm: THREE.Object3D | null = null;
  private rightUpperArm: THREE.Object3D | null = null;
  private leftForeArm: THREE.Object3D | null = null;
  private rightForeArm: THREE.Object3D | null = null;
  private leftHand: THREE.Object3D | null = null;
  private rightHand: THREE.Object3D | null = null;
  private leftUpperLeg: THREE.Object3D | null = null;
  private rightUpperLeg: THREE.Object3D | null = null;
  private leftLeg: THREE.Object3D | null = null;
  private rightLeg: THREE.Object3D | null = null;
  private leftFoot: THREE.Object3D | null = null;
  private rightFoot: THREE.Object3D | null = null;

  // Materials for outfit styling
  private outfitMaterials: THREE.MeshStandardMaterial[] = [];
  private currentOutfit: CharacterOutfitKind = 'explorer';

  // Motion blends
  private swimBlend = 0;
  private locomotionBlend = 0;
  private landingSquash = 0;
  private currentEmote: EmoteKind = 'none';
  private emoteTime = 0;

  // Working vectors
  private limbStart = new THREE.Vector3();
  private limbEnd = new THREE.Vector3();
  private limbDirection = new THREE.Vector3();
  private limbTarget = new THREE.Vector3();
  private avatarWorldQuaternion = new THREE.Quaternion();
  private limbWorldQuaternion = new THREE.Quaternion();
  private limbParentQuaternion = new THREE.Quaternion();
  private limbDeltaQuaternion = new THREE.Quaternion();

  constructor(lowPowerMode: boolean, onLoaded?: () => void) {
    this.root.name = 'player-adventurer';
    this.fallback = new THREE.Group();
    this.fallback.name = 'player-fallback';

    const mat = new THREE.MeshStandardMaterial({ color: 0x486b7c, roughness: 0.88 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.68, 3, 7), mat);
    body.position.y = 0.78;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), mat);
    head.position.y = 1.42;
    for (const mesh of [body, head]) {
      mesh.castShadow = !lowPowerMode;
      mesh.receiveShadow = true;
      this.fallback.add(mesh);
    }
    this.root.add(this.fallback);

    // Load Kenney human adventurer GLB
    import('three/addons/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => {
        new GLTFLoader().load(
          '/models/kenney-adventurer.glb',
          gltf => {
            const avatar = gltf.scene;
            avatar.name = 'kenney-human-adventurer';
            avatar.scale.setScalar(0.45);

            this.headBone = avatar.getObjectByName('Head') ?? null;
            this.spineBone = avatar.getObjectByName('Spine') ?? null;
            this.chestBone = avatar.getObjectByName('Chest') ?? null;
            this.leftUpperArm = avatar.getObjectByName('LeftArm') ?? null;
            this.rightUpperArm = avatar.getObjectByName('RightArm') ?? null;
            this.leftForeArm = avatar.getObjectByName('LeftForeArm') ?? null;
            this.rightForeArm = avatar.getObjectByName('RightForeArm') ?? null;
            this.leftHand = avatar.getObjectByName('LeftHand') ?? null;
            this.rightHand = avatar.getObjectByName('RightHand') ?? null;
            this.leftUpperLeg = avatar.getObjectByName('LeftUpLeg') ?? null;
            this.rightUpperLeg = avatar.getObjectByName('RightUpLeg') ?? null;
            this.leftLeg = avatar.getObjectByName('LeftLeg') ?? null;
            this.rightLeg = avatar.getObjectByName('RightLeg') ?? null;
            this.leftFoot = avatar.getObjectByName('LeftFoot') ?? null;
            this.rightFoot = avatar.getObjectByName('RightFoot') ?? null;

            avatar.traverse(o => {
              if (o instanceof THREE.Mesh) {
                o.castShadow = !lowPowerMode;
                o.receiveShadow = true;
                if (o.material) {
                  const m = o.material.clone() as THREE.MeshStandardMaterial;
                  m.roughness = 0.75;
                  o.material = m;
                  this.outfitMaterials.push(m);
                }
              }
            });

            // Attach high-detail adventurer accessories to enhance visual appeal
            this.attachAccessories(lowPowerMode);

            this.root.add(avatar);
            this.avatar = avatar;

            // Remove placeholder fallback
            this.fallback.traverse(o => {
              if (o instanceof THREE.Mesh) {
                o.geometry.dispose();
                const list = Array.isArray(o.material) ? o.material : [o.material];
                for (const m of list) m.dispose();
              }
            });
            this.root.remove(this.fallback);

            this.mixer = new THREE.AnimationMixer(avatar);
            this.mixer.addEventListener('finished', event => {
              if (event.action === this.activeAction) {
                this.activeAction = null;
                this.oneShot = false;
              }
            });

            for (const clip of gltf.animations) {
              const n = clip.name.toLowerCase();
              const key = n.startsWith('idle') ? 'Idle' : n.startsWith('run') ? 'Run' : n.startsWith('jump') ? 'Jump' : null;
              if (key) this.actions.set(key, this.mixer.clipAction(clip));
            }

            this.setAction('Idle', true, 0.01);
            this.applyOutfit(this.currentOutfit);
            if (onLoaded) onLoaded();
          },
          undefined,
          err => console.warn('Player fallback kept:', err)
        );
      })
      .catch(err => console.warn('GLTFLoader import failed:', err));
  }

  // Attach sculpted explorer backpack, belt with canteen & pouch, and hat
  private attachAccessories(lowPowerMode: boolean) {
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x5a361e, roughness: 0.82 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a046, metalness: 0.85, roughness: 0.35 });
    const canvasMat = new THREE.MeshStandardMaterial({ color: 0x425666, roughness: 0.9 });
    const bedrollMat = new THREE.MeshStandardMaterial({ color: 0xa87146, roughness: 0.95 });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x3d2c1f, roughness: 0.85 });
    const featherMat = new THREE.MeshStandardMaterial({ color: 0xc43b2f, roughness: 0.6 });

    // 1. Explorer Backpack on Chest/Spine
    const backpackTarget = this.chestBone || this.spineBone;
    if (backpackTarget) {
      const backpack = new THREE.Group();
      backpack.name = 'adventurer-backpack';
      backpack.position.set(0, 0.22, -0.24);

      // Main pack body
      const packBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), leatherMat);
      packBody.castShadow = !lowPowerMode;
      backpack.add(packBody);

      // Flap cover with buckle
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.22, 0.34), canvasMat);
      flap.position.set(0, 0.24, 0.01);
      backpack.add(flap);

      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), brassMat);
      buckle.position.set(0, 0.12, -0.17);
      backpack.add(buckle);

      // Bedroll rolled across the top
      const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.68, 8), bedrollMat);
      bedroll.rotation.z = Math.PI / 2;
      bedroll.position.set(0, 0.44, 0);
      backpack.add(bedroll);

      // Bedroll leather binding straps
      for (const side of [-0.2, 0.2]) {
        const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 8), leatherMat);
        strap.rotation.z = Math.PI / 2;
        strap.position.set(side, 0.44, 0);
        backpack.add(strap);
      }

      // Side water canteen
      const canteen = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 6), brassMat);
      canteen.position.set(0.32, -0.05, 0);
      backpack.add(canteen);

      // Side pouch
      const sidePouch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.18), leatherMat);
      sidePouch.position.set(-0.32, -0.05, 0);
      backpack.add(sidePouch);

      backpackTarget.add(backpack);
    }

    // 2. Wide-brim Ranger Hat on Head
    if (this.headBone) {
      const hat = new THREE.Group();
      hat.name = 'adventurer-hat';
      hat.position.set(0, 0.36, 0.02);

      // Crown
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.22, 10), hatMat);
      hat.add(crown);

      // Wide Brim
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.04, 12), hatMat);
      brim.position.y = -0.08;
      hat.add(brim);

      // Hatband
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.05, 10), brassMat);
      band.position.y = -0.04;
      hat.add(band);

      // Crimson feather
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.28, 4), featherMat);
      feather.position.set(0.26, 0.12, 0);
      feather.rotation.z = -0.35;
      feather.rotation.x = -0.15;
      hat.add(feather);

      this.headBone.add(hat);
    }

    // 3. Waist Explorer Belt & Tool Satchel
    if (this.spineBone) {
      const beltGroup = new THREE.Group();
      beltGroup.name = 'adventurer-belt';
      beltGroup.position.set(0, -0.05, 0);

      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 10), leatherMat);
      beltGroup.add(belt);

      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), brassMat);
      buckle.position.set(0, 0, 0.36);
      beltGroup.add(buckle);

      this.spineBone.add(beltGroup);
    }
  }

  // Outfit & Color Customization
  applyOutfit(outfit: CharacterOutfitKind): void {
    this.currentOutfit = outfit;
    const palette = OUTFIT_PALETTES[outfit];
    if (!palette) return;

    for (const mat of this.outfitMaterials) {
      mat.color.set(palette.tunic);
    }
  }

  getOutfit(): CharacterOutfitKind {
    return this.currentOutfit;
  }

  private setAction(name: string, loop: boolean, fade = 0.16): void {
    const next = this.actions.get(name);
    if (!next || next === this.activeAction) return;
    this.activeAction?.fadeOut(fade);
    next.reset();
    next.enabled = true;
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(fade).play();
    this.activeAction = next;
  }

  playJump(): void {
    if (this.currentEmote !== 'none') this.clearEmote();
    const next = this.actions.get('Jump');
    if (!next) return;
    this.activeAction?.fadeOut(0.08);
    this.oneShot = true;
    next.reset();
    next.enabled = true;
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.fadeIn(0.08).play();
    this.activeAction = next;
  }

  triggerLanding(): void {
    this.landingSquash = 0.22;
  }

  playEmote(kind: EmoteKind): void {
    if (this.swimming) return;
    this.currentEmote = kind;
    this.emoteTime = 0;
  }

  clearEmote(): void {
    this.currentEmote = 'none';
    this.emoteTime = 0;
  }

  getEmote(): EmoteKind {
    return this.currentEmote;
  }

  // Two-bone direction solver relative to the avatar root
  private aimLimbSegment(bone: THREE.Object3D | null, child: THREE.Object3D | null, x: number, y: number, z: number): void {
    if (!bone || !child || !bone.parent || !this.avatar) return;
    bone.getWorldPosition(this.limbStart);
    child.getWorldPosition(this.limbEnd);
    this.limbDirection.copy(this.limbEnd).sub(this.limbStart);
    if (this.limbDirection.lengthSq() < 1e-6) return;
    this.limbDirection.normalize();

    this.avatar.getWorldQuaternion(this.avatarWorldQuaternion);
    this.limbTarget.set(x, y, z).normalize().applyQuaternion(this.avatarWorldQuaternion);
    this.limbDeltaQuaternion.setFromUnitVectors(this.limbDirection, this.limbTarget);
    bone.getWorldQuaternion(this.limbWorldQuaternion);
    bone.parent.getWorldQuaternion(this.limbParentQuaternion).invert();

    this.limbWorldQuaternion.premultiply(this.limbDeltaQuaternion);
    bone.quaternion.copy(this.limbParentQuaternion).multiply(this.limbWorldQuaternion);
  }

  animate(
    t: number,
    moving: boolean,
    sprinting: boolean,
    swimming: boolean,
    dt: number,
    speed = 0,
    turnRate = 0
  ): void {
    this.mixer?.update(dt);

    if (moving && this.currentEmote !== 'none') {
      this.clearEmote();
    }

    if (swimming && this.oneShot) {
      this.activeAction?.fadeOut(0.1);
      this.activeAction = null;
      this.oneShot = false;
    }

    if (this.landingSquash > 0) {
      this.landingSquash = Math.max(0, this.landingSquash - dt * 2.2);
    }

    const idle = this.actions.get('Idle');
    const run = this.actions.get('Run');

    for (const action of [idle, run]) {
      if (action && !action.isRunning()) {
        action.reset();
        action.enabled = true;
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
      }
    }

    const isEmoting = this.currentEmote !== 'none';

    // Blend between Idle and Run
    if (!this.oneShot && idle && run) {
      if (isEmoting) {
        // Complete mute of walk/idle clips so procedural emotes have 100% clean authority
        idle.setEffectiveWeight(0);
        run.setEffectiveWeight(0);
      } else {
        const targetWeight = swimming || !moving ? 0 : sprinting ? 1.0 : 0.42;
        this.locomotionBlend = lerp(this.locomotionBlend, targetWeight, Math.min(1, dt * 6));
        idle.setEffectiveWeight(1 - this.locomotionBlend);
        run.setEffectiveWeight(this.locomotionBlend);

        idle.setEffectiveTimeScale(1.0);
        const walkScale = clamp(speed / 4.2, 0.5, 1.1);
        const runScale = clamp(speed / 7.2, 0.8, 1.35);
        run.setEffectiveTimeScale(sprinting ? runScale : walkScale);
      }
    } else {
      idle?.setEffectiveWeight(0);
      run?.setEffectiveWeight(0);
    }

    this.swimBlend = lerp(this.swimBlend, swimming ? 1 : 0, Math.min(1, dt * 5));

    // --- SWIMMING ANIMATION ---
    if (this.swimBlend > 0.05) {
      const strokePhase = t * (sprinting ? 6.2 : 4.2);
      const stroke = moving ? Math.sin(strokePhase) * 0.72 : Math.sin(t * 1.5) * 0.12;

      if (this.leftUpperArm) {
        const base = this.leftUpperArm.rotation.clone();
        this.leftUpperArm.rotation.set(
          lerp(base.x, -1.25 - stroke, this.swimBlend),
          lerp(base.y, 0.15, this.swimBlend),
          lerp(base.z, -Math.PI * 0.95, this.swimBlend)
        );
      }
      if (this.rightUpperArm) {
        const base = this.rightUpperArm.rotation.clone();
        this.rightUpperArm.rotation.set(
          lerp(base.x, 2.8 + stroke, this.swimBlend),
          lerp(base.y, 1.15, this.swimBlend),
          lerp(base.z, Math.PI / 2, this.swimBlend)
        );
      }

      const elbow = moving ? 0.28 + 0.3 * Math.max(0, Math.cos(strokePhase)) : 0.18;
      if (this.leftForeArm) this.leftForeArm.rotation.x += elbow * this.swimBlend;
      if (this.rightForeArm) this.rightForeArm.rotation.x += elbow * this.swimBlend;

      const kick = (moving ? (sprinting ? 0.45 : 0.3) : 0.08) * this.swimBlend;
      if (this.leftUpperLeg) this.leftUpperLeg.rotation.x += Math.sin(strokePhase * 1.5) * kick;
      if (this.rightUpperLeg) this.rightUpperLeg.rotation.x += Math.sin(strokePhase * 1.5 + Math.PI) * kick;
    }

    // --- PROCEDURAL LEAN & SQUASH ---
    if (this.avatar) {
      const squashY = 1.0 - this.landingSquash * 0.45;
      const squashXZ = 1.0 + this.landingSquash * 0.22;
      this.avatar.scale.set(0.45 * squashXZ, 0.45 * squashY, 0.45 * squashXZ);

      const forwardLean = swimming ? 1.35 : moving ? (sprinting ? 0.12 : 0.04) : 0;
      const bankLean = moving ? clamp(-turnRate * 0.25, -0.15, 0.15) : 0;
      this.avatar.rotation.x = lerp(this.avatar.rotation.x, forwardLean, Math.min(1, dt * 6));
      this.avatar.rotation.z = lerp(this.avatar.rotation.z, bankLean, Math.min(1, dt * 8));

      if (swimming) {
        this.avatar.position.y = Math.sin(t * 2.8) * 0.024;
      } else if (moving) {
        const stepRate = sprinting ? 9.2 : 5.8;
        this.avatar.position.y = Math.abs(Math.sin(t * stepRate)) * (sprinting ? 0.042 : 0.022);
      } else if (this.currentEmote === 'none') {
        this.avatar.position.y = Math.sin(t * 1.8) * 0.008;
      }
    }

    // Natural Arm Swing when Walking / Running
    if (!swimming && !this.oneShot && this.avatar && this.currentEmote === 'none') {
      const gaitPhase = t * (sprinting ? 9.2 : 5.8);
      const armSwing = moving ? Math.sin(gaitPhase) * (sprinting ? 0.38 : 0.22) : 0;

      this.avatar.updateMatrixWorld(true);
      this.aimLimbSegment(this.leftUpperArm, this.leftForeArm, 0.1, -0.94, armSwing);
      this.aimLimbSegment(this.rightUpperArm, this.rightForeArm, -0.1, -0.94, -armSwing);
      this.aimLimbSegment(this.leftForeArm, this.leftHand, 0.04, -0.96, 0.14 + armSwing * 0.55);
      this.aimLimbSegment(this.rightForeArm, this.rightHand, -0.04, -0.96, 0.14 - armSwing * 0.55);
    }

    // --- REFINED EXPRESSIVE PROCEDURAL EMOTES ---
    if (this.currentEmote !== 'none' && !swimming && this.avatar) {
      this.emoteTime += dt;
      this.avatar.updateMatrixWorld(true);

      if (this.currentEmote === 'wave') {
        // Natural, Highly Visible Friendly Wave Beside the Head:
        // Right Arm is raised outward and upward next to the temple
        if (this.rightUpperArm) {
          this.rightUpperArm.rotation.set(0.35, -0.2, -1.85);
        }
        if (this.rightForeArm) {
          this.rightForeArm.rotation.set(0.15, 0, 0.85);
        }
        // Hand waves side to side enthusiastically near forehead/temple
        if (this.rightHand) {
          this.rightHand.rotation.z = Math.sin(this.emoteTime * 8.0) * 0.45;
        }

        // Head gently tilts toward the wave
        if (this.headBone) {
          this.headBone.rotation.z = 0.14;
          this.headBone.rotation.y = -0.12;
        }

        // Left arm rests naturally at side
        if (this.leftUpperArm) this.leftUpperArm.rotation.set(0.1, 0, 0.2);
        if (this.leftForeArm) this.leftForeArm.rotation.set(0.2, 0, 0);

      } else if (this.currentEmote === 'cheer') {
        // Both arms raised high in triumphant victory with joyful hops
        const hop = Math.max(0, Math.sin(this.emoteTime * 7.0)) * 0.09;
        this.avatar.position.y = hop;
        const cheerSway = Math.sin(this.emoteTime * 5.0) * 0.18;

        if (this.leftUpperArm) this.leftUpperArm.rotation.set(0.3, 0, 2.5);
        if (this.rightUpperArm) this.rightUpperArm.rotation.set(0.3, 0, -2.5);
        if (this.leftForeArm) this.leftForeArm.rotation.set(0, 0, 0.4 + cheerSway);
        if (this.rightForeArm) this.rightForeArm.rotation.set(0, 0, -0.4 - cheerSway);

        if (this.headBone) this.headBone.rotation.x = -0.24;

      } else if (this.currentEmote === 'sit') {
        // NATURAL PEACEFUL SITTING POSE:
        // Lower avatar body to ground level
        this.avatar.position.y = -0.44;

        // Thighs bend naturally FORWARD and slightly outward (knees pointing forward/up):
        // Never backward into waist!
        if (this.leftUpperLeg) {
          this.leftUpperLeg.rotation.set(-1.38, 0.35, 0.22);
        }
        if (this.rightUpperLeg) {
          this.rightUpperLeg.rotation.set(-1.38, -0.35, -0.22);
        }

        // Shins fold inward in comfortable cross-legged posture
        if (this.leftLeg) {
          this.leftLeg.rotation.set(1.48, -0.22, 0.1);
        }
        if (this.rightLeg) {
          this.rightLeg.rotation.set(1.48, 0.22, -0.1);
        }
        if (this.leftFoot) this.leftFoot.rotation.set(-0.25, 0, 0);
        if (this.rightFoot) this.rightFoot.rotation.set(-0.25, 0, 0);

        // Arms rest naturally on knees
        if (this.leftUpperArm) this.leftUpperArm.rotation.set(0.42, 0.15, 0.35);
        if (this.rightUpperArm) this.rightUpperArm.rotation.set(0.42, -0.15, -0.35);
        if (this.leftForeArm) this.leftForeArm.rotation.set(0.72, 0, 0.15);
        if (this.rightForeArm) this.rightForeArm.rotation.set(0.72, 0, -0.15);

        // Torso posture upright with calm meditative breathing
        if (this.spineBone) {
          this.spineBone.rotation.x = 0.08 + Math.sin(this.emoteTime * 1.8) * 0.02;
        }

      } else if (this.currentEmote === 'dance') {
        // Groovy celebratory dance with rhythmic sway and arm pumps
        const dancePhase = this.emoteTime * 5.5;
        this.avatar.position.y = Math.abs(Math.sin(dancePhase)) * 0.06;
        this.avatar.rotation.y = Math.sin(dancePhase * 0.5) * 0.35;
        this.avatar.rotation.z = Math.cos(dancePhase * 0.5) * 0.08;

        const leftPump = Math.sin(dancePhase) * 0.5;
        const rightPump = -Math.sin(dancePhase) * 0.5;

        if (this.leftUpperArm) this.leftUpperArm.rotation.set(0.6 + leftPump, 0, 1.2);
        if (this.rightUpperArm) this.rightUpperArm.rotation.set(0.6 + rightPump, 0, -1.2);
        if (this.leftForeArm) this.leftForeArm.rotation.set(0.8, 0, 0);
        if (this.rightForeArm) this.rightForeArm.rotation.set(0.8, 0, 0);

      } else if (this.currentEmote === 'inspect') {
        // Thoughtful inspect/crouch posture to examine ground tracks and flora
        this.avatar.position.y = -0.26;
        this.avatar.rotation.x = 0.28;

        // Crouch legs
        if (this.leftUpperLeg) this.leftUpperLeg.rotation.set(-0.95, 0.15, 0.1);
        if (this.rightUpperLeg) this.rightUpperLeg.rotation.set(-1.15, -0.15, -0.1);
        if (this.leftLeg) this.leftLeg.rotation.set(1.15, 0, 0);
        if (this.rightLeg) this.rightLeg.rotation.set(1.35, 0, 0);

        // Right hand reaches down toward the ground
        if (this.rightUpperArm) this.rightUpperArm.rotation.set(0.9, -0.2, -0.3);
        if (this.rightForeArm) this.rightForeArm.rotation.set(0.5, 0, 0);

        // Left arm rests on left thigh
        if (this.leftUpperArm) this.leftUpperArm.rotation.set(0.7, 0.2, 0.3);
        if (this.leftForeArm) this.leftForeArm.rotation.set(0.6, 0, 0);

        if (this.headBone) this.headBone.rotation.x = 0.45;
      }
    }
  }
}
