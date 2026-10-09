import * as THREE from 'three';
import { createWeaponRig, type SurvivalWeaponId, type WeaponRig, SURVIVAL_WEAPON_REGISTRY } from './survival-weapons';
import { survivalSound } from './survival-audio';
export type { SurvivalWeaponId } from './survival-weapons';
export type SurvivalPickupKind = 'ammo' | 'medkit';

export interface SafeZoneDefinition {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
}

export interface SurvivalRadarState {
  safeZones: Array<{ id: string; label: string; x: number; z: number; radius: number }>;
  zombies: Array<{ x: number; z: number; type: 'walker' | 'runner' | 'brute' }>;
}

export interface SurvivalStatus {
  enabled: boolean;
  health: number;
  maxHealth: number;
  weapon: SurvivalWeaponId;
  weaponLabel: string;
  ammoInMag: number;
  ammoReserve: number;
  kills: number;
  wave: number;
  livingZombies: number;
  inSafeZone: boolean;
  nearestZone: string;
  zoneDistance: number;
  reloading: boolean;
  dead: boolean;
}

export interface ZombieSurvivalOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  getPlayerPosition: () => THREE.Vector3;
  getTerrainHeight: (x: number, z: number) => number;
  isWater: (x: number, z: number) => boolean;
  getWaterDepth: (x: number, z: number) => number;
  canOccupy: (x: number, z: number) => boolean;
  getSightBlockers: () => THREE.Object3D[];
  safeZones: SafeZoneDefinition[];
  lowPowerMode: boolean;
  respawnPlayer: () => void;
  notify: (message: string) => void;
  onStatus: (status: SurvivalStatus) => void;
  onDamage: () => void;
  onDeath: () => void;
}

interface WeaponTuning {
  label: string;
  magSize: number;
  damage: number;
  fireInterval: number;
  reloadTime: number;
  range: number;
  spread: number;
  pellets: number;
  automatic: boolean;
  reserveStart: number;
  recoilKick: number;
  recoilRecovery: number;
}

// Balance and weapon names come from the Fire at Will prototype's registry.
// Starting reserves are tuned for our survival loop rather than copied from its UI state.
const WEAPONS: Record<SurvivalWeaponId, WeaponTuning> = {
  pistol: {
    label: SURVIVAL_WEAPON_REGISTRY.pistol.name.toUpperCase(),
    magSize: SURVIVAL_WEAPON_REGISTRY.pistol.magSize,
    damage: SURVIVAL_WEAPON_REGISTRY.pistol.damage,
    fireInterval: 1 / SURVIVAL_WEAPON_REGISTRY.pistol.fireRate,
    reloadTime: SURVIVAL_WEAPON_REGISTRY.pistol.reloadTime,
    range: SURVIVAL_WEAPON_REGISTRY.pistol.range,
    spread: SURVIVAL_WEAPON_REGISTRY.pistol.spread,
    pellets: SURVIVAL_WEAPON_REGISTRY.pistol.pellets,
    automatic: SURVIVAL_WEAPON_REGISTRY.pistol.automatic,
    reserveStart: 60,
    recoilKick: SURVIVAL_WEAPON_REGISTRY.pistol.recoilKick,
    recoilRecovery: SURVIVAL_WEAPON_REGISTRY.pistol.recoilRecovery,
  },
  shotgun: {
    label: SURVIVAL_WEAPON_REGISTRY.shotgun.name.toUpperCase(),
    magSize: SURVIVAL_WEAPON_REGISTRY.shotgun.magSize,
    damage: SURVIVAL_WEAPON_REGISTRY.shotgun.damage,
    fireInterval: 1 / SURVIVAL_WEAPON_REGISTRY.shotgun.fireRate,
    reloadTime: SURVIVAL_WEAPON_REGISTRY.shotgun.reloadTime,
    range: SURVIVAL_WEAPON_REGISTRY.shotgun.range,
    spread: SURVIVAL_WEAPON_REGISTRY.shotgun.spread,
    pellets: SURVIVAL_WEAPON_REGISTRY.shotgun.pellets,
    automatic: SURVIVAL_WEAPON_REGISTRY.shotgun.automatic,
    reserveStart: 24,
    recoilKick: SURVIVAL_WEAPON_REGISTRY.shotgun.recoilKick,
    recoilRecovery: SURVIVAL_WEAPON_REGISTRY.shotgun.recoilRecovery,
  },
  rifle: {
    label: SURVIVAL_WEAPON_REGISTRY.rifle.name.toUpperCase(),
    magSize: SURVIVAL_WEAPON_REGISTRY.rifle.magSize,
    damage: SURVIVAL_WEAPON_REGISTRY.rifle.damage,
    fireInterval: 1 / SURVIVAL_WEAPON_REGISTRY.rifle.fireRate,
    reloadTime: SURVIVAL_WEAPON_REGISTRY.rifle.reloadTime,
    range: SURVIVAL_WEAPON_REGISTRY.rifle.range,
    spread: SURVIVAL_WEAPON_REGISTRY.rifle.spread,
    pellets: SURVIVAL_WEAPON_REGISTRY.rifle.pellets,
    automatic: SURVIVAL_WEAPON_REGISTRY.rifle.automatic,
    reserveStart: 90,
    recoilKick: SURVIVAL_WEAPON_REGISTRY.rifle.recoilKick,
    recoilRecovery: SURVIVAL_WEAPON_REGISTRY.rifle.recoilRecovery,
  },
};

interface ZombieActor {
  id: number;
  type: 'walker' | 'runner' | 'brute';
  root: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  position: THREE.Vector3;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  lastAttack: number;
  phase: number;
  dead: boolean;
  deathAge: number;
  flash: number;
  flesh: THREE.MeshStandardMaterial;
  clothing: THREE.MeshStandardMaterial;
}

interface LootDrop {
  root: THREE.Group;
  kind: SurvivalPickupKind;
  amount: number;
}

const V3_UP = new THREE.Vector3(0, 1, 0);

function makeMesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function setRigFlashOpacity(rig: WeaponRig, opacity: number): void {
  rig.muzzleFlash.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshBasicMaterial && material.transparent) {
        material.opacity = opacity;
      }
    }
  });
}

function disposeGroup(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    for (const mat of mats) materials.add(mat);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export class ZombieSurvivalSystem {
  public enabled = true;
  public isDead = false;
  public health = 100;
  public maxHealth = 100;
  public kills = 0;
  public wave = 0;
  public weapon: SurvivalWeaponId = 'pistol';
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;

  private readonly options: ZombieSurvivalOptions;
  private readonly zones: Array<SafeZoneDefinition & { root: THREE.Group }> = [];
  private readonly zombies: ZombieActor[] = [];
  private readonly loot: LootDrop[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly centerNdc = new THREE.Vector2(0, 0);
  private readonly intersections: THREE.Intersection[] = [];
  private readonly tracerLines: Array<{ line: THREE.Line; age: number }> = [];
  private readonly hitSparks: Array<{ mesh: THREE.Mesh; age: number }> = [];
  private readonly weaponRigs = new Map<SurvivalWeaponId, WeaponRig>();
  private readonly slideBaseZ = new Map<SurvivalWeaponId, number>();
  private ammo: Record<SurvivalWeaponId, { mag: number; reserve: number }> = {
    pistol: { mag: 15, reserve: WEAPONS.pistol.reserveStart },
    shotgun: { mag: 8, reserve: WEAPONS.shotgun.reserveStart },
    rifle: { mag: 30, reserve: WEAPONS.rifle.reserveStart },
  };
  private fireCooldown = 0;
  private reloadTimer = 0;
  private aimActive = false;
  private fireHeld = false;
  private muzzleTimer = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private waveQueue = 0;
  private breakTimer = 0;
  private hasEnteredHostileArea = false;
  private statusTimer = 0;
  private flashDamageTimer = 0;
  private lastFov = 62;
  private nextZombieId = 1;
  private maxZombies: number;
  private killedThisWave = 0;

  constructor(options: ZombieSurvivalOptions) {
    this.options = options;
    this.scene = options.scene;
    this.camera = options.camera;
    this.maxZombies = options.lowPowerMode ? 5 : 9;

    for (const def of options.safeZones) {
      const root = this.createSafeZone(def);
      this.scene.add(root);
      this.zones.push({ ...def, root });
    }

    this.createWeaponRigs();
    for (const [id, rig] of this.weaponRigs) {
      this.camera.add(rig.root);
      rig.root.visible = id === this.weapon;
      rig.muzzleFlash.visible = false;
      rig.muzzleLight.intensity = 0;
    }
    this.setEnabled(true);
    this.emitStatus();
  }

  private createSafeZone(def: SafeZoneDefinition): THREE.Group {
    const root = new THREE.Group();
    root.name = `safe-zone-${def.id}`;
    const field = makeMesh(
      new THREE.CircleGeometry(def.radius, 48),
      new THREE.MeshBasicMaterial({ color: 0x20c878, transparent: true, opacity: 0.055, depthWrite: false, side: THREE.DoubleSide }),
      'safe-zone-field'
    );
    field.rotation.x = -Math.PI / 2;
    field.position.y = 0.065;
    root.add(field);

    const ring = makeMesh(
      new THREE.TorusGeometry(def.radius, 0.075, 5, 64),
      new THREE.MeshStandardMaterial({ color: 0x41f59a, emissive: 0x087a43, emissiveIntensity: 1.4, roughness: 0.35, metalness: 0.12 }),
      'safe-zone-boundary'
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    root.add(ring);

    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0x35ec92, emissive: 0x17c978, emissiveIntensity: 1.2, roughness: 0.4,
    });
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + Math.PI / 4;
      const beacon = makeMesh(new THREE.CylinderGeometry(0.075, 0.12, 1.35, 6), beaconMat, 'safe-zone-beacon');
      beacon.position.set(Math.cos(angle) * (def.radius - 0.45), 0.65, Math.sin(angle) * (def.radius - 0.45));
      root.add(beacon);
      const cap = makeMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9cffc8 }), 'safe-zone-light');
      cap.position.set(beacon.position.x, 1.38, beacon.position.z);
      root.add(cap);
    }
    root.position.set(def.x, this.options.getTerrainHeight(def.x, def.z), def.z);
    return root;
  }

  private createWeaponRigs(): void {
    const ids: SurvivalWeaponId[] = ['pistol', 'shotgun', 'rifle'];
    for (const id of ids) {
      // Reuse the distinct procedural pistol/shotgun/rifle models authored in Fire at Will.
      const rig = createWeaponRig(id);
      rig.root.name = `survival-${id}-rig`;
      this.weaponRigs.set(id, rig);
      if (rig.slideOrPump) this.slideBaseZ.set(id, rig.slideOrPump.position.z);
      setRigFlashOpacity(rig, 0);
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.zones.forEach(zone => (zone.root.visible = enabled));
    this.zombies.forEach(actor => (actor.root.visible = enabled));
    this.loot.forEach(drop => (drop.root.visible = enabled));
    if (!enabled) this.muzzleTimer = 0;
    for (const [id, rig] of this.weaponRigs) {
      rig.root.visible = enabled && id === this.weapon;
      rig.muzzleFlash.visible = false;
      setRigFlashOpacity(rig, 0);
      rig.muzzleLight.intensity = 0;
    }
    if (!enabled) {
      this.fireHeld = false;
      this.aimActive = false;
      this.setAim(false);
      survivalSound.updateHeartbeat(1);
      survivalSound.setAmbientEnabled(false);
      for (const trace of this.tracerLines) {
        this.scene.remove(trace.line);
        trace.line.geometry.dispose();
        (trace.line.material as THREE.Material).dispose();
      }
      this.tracerLines.length = 0;
      for (const spark of this.hitSparks) {
        this.scene.remove(spark.mesh);
        disposeGroup(spark.mesh);
      }
      this.hitSparks.length = 0;
    }
    this.emitStatus();
  }

  activateAudio(): void {
    // Call only from a real key/pointer interaction so mobile browsers can unlock Web Audio.
    survivalSound.init();
    survivalSound.setVolumes(0.72, 0.82);
  }

  setAmbientEnabled(enabled: boolean): void {
    survivalSound.setAmbientEnabled(enabled);
  }

  setSurvivalAudioHealth(healthRatio: number): void {
    survivalSound.updateHeartbeat(this.enabled ? Math.max(0, Math.min(1, healthRatio)) : 1);
  }

  setFireHeld(held: boolean): void {
    this.fireHeld = held;
  }

  setAim(aiming: boolean): void {
    this.aimActive = aiming && this.enabled && !this.isDead;
    const wantedFov = this.aimActive ? 47 : this.lastFov;
    if (Math.abs(this.camera.fov - wantedFov) > 0.15) {
      this.camera.fov += (wantedFov - this.camera.fov) * 0.24;
      this.camera.updateProjectionMatrix();
    }
    if (!this.aimActive && this.camera.fov !== this.lastFov && !this.enabled) {
      this.camera.fov = this.lastFov;
      this.camera.updateProjectionMatrix();
    }
  }

  switchWeapon(id: SurvivalWeaponId): void {
    if (!this.enabled || this.isDead) return;
    this.weapon = id;
    for (const [weaponId, rig] of this.weaponRigs) {
      rig.root.visible = this.enabled && weaponId === id;
      rig.root.position.copy(rig.basePos);
      rig.root.rotation.copy(rig.baseRot);
      rig.muzzleFlash.visible = false;
      rig.muzzleLight.intensity = 0;
      setRigFlashOpacity(rig, 0);
    }
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.options.notify(`Weapon: ${WEAPONS[id].label}`);
    this.emitStatus();
  }

  fire(): void {
    if (!this.enabled || this.isDead || this.reloadTimer > 0 || this.fireCooldown > 0) return;
    this.activateAudio();
    const definition = WEAPONS[this.weapon];
    const currentAmmo = this.ammo[this.weapon];
    if (currentAmmo.mag <= 0) {
      survivalSound.playDryFire();
      this.options.notify(currentAmmo.reserve > 0 ? 'Magazine empty · reload' : 'No ammunition left');
      this.fireCooldown = 0.28;
      return;
    }

    survivalSound.playGunshot(this.weapon);
    currentAmmo.mag--;
    this.fireCooldown = definition.fireInterval;
    this.muzzleTimer = 0.065;
    const activeRig = this.weaponRigs.get(this.weapon);
    if (activeRig) {
      activeRig.muzzleFlash.visible = true;
      setRigFlashOpacity(activeRig, 0.95);
      activeRig.muzzleLight.intensity = this.options.lowPowerMode ? 0.8 : 1.5;
    }
    this.kickWeapon();
    this.options.onStatus(this.status());
    this.intersections.length = 0;

    this.camera.updateMatrixWorld(true);
    this.scene.updateMatrixWorld(true);
    const blockers = this.options.getSightBlockers();
    const targets = this.zombies.filter(z => !z.dead).map(z => z.root);
    const rayObjects = [...blockers, ...targets];
    const totalSpread = definition.spread * (this.aimActive ? 0.42 : 1);
    const muzzle = new THREE.Vector3();
    activeRig?.muzzleFlash.getWorldPosition(muzzle);
    if (!activeRig) this.camera.getWorldPosition(muzzle);

    let registeredHit = false;
    for (let pellet = 0; pellet < definition.pellets; pellet++) {
      const ndc = this.centerNdc.set(
        (Math.random() - 0.5) * totalSpread * 2,
        (Math.random() - 0.5) * totalSpread * 2
      );
      this.raycaster.setFromCamera(ndc, this.camera);
      this.raycaster.far = definition.range;
      this.intersections.length = 0;
      this.raycaster.intersectObjects(rayObjects, true, this.intersections);
      const hit = this.intersections[0];
      let end = this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, definition.range);
      if (hit) {
        end.copy(hit.point);
        const actor = hit.object.userData.survivalZombie as ZombieActor | undefined;
        if (actor && !actor.dead) {
          const headshot = hit.object.userData.survivalHead === true;
          const damage = definition.damage * (headshot ? 2.45 : 1);
          this.damageZombie(actor, damage, headshot, !registeredHit);
          registeredHit = true;
        } else {
          this.spawnImpact(hit.point, false);
        }
      }
      this.spawnTracer(muzzle, end);
    }
    if (!registeredHit) this.options.notify(currentAmmo.mag === 0 ? 'Magazine empty · reload' : '');
    this.emitStatus();
  }

  reload(): void {
    if (!this.enabled || this.isDead || this.reloadTimer > 0) return;
    this.activateAudio();
    const ammo = this.ammo[this.weapon];
    const definition = WEAPONS[this.weapon];
    if (ammo.mag >= definition.magSize || ammo.reserve <= 0) {
      if (ammo.reserve <= 0) this.options.notify('No reserve ammunition');
      return;
    }
    this.reloadTimer = definition.reloadTime;
    survivalSound.playReload();
    this.options.notify('RELOADING');
    this.emitStatus();
  }

  private finishReload(): void {
    const ammo = this.ammo[this.weapon];
    const needed = WEAPONS[this.weapon].magSize - ammo.mag;
    const loaded = Math.min(needed, ammo.reserve);
    ammo.mag += loaded;
    ammo.reserve -= loaded;
    this.reloadTimer = 0;
    this.options.notify('Reload complete');
    this.emitStatus();
  }

  private kickWeapon(): void {
    const rig = this.weaponRigs.get(this.weapon);
    if (!rig) return;
    const recoil = WEAPONS[this.weapon].recoilKick;
    rig.root.position.z = (this.aimActive ? rig.adsPos.z : rig.basePos.z) + recoil;
    rig.root.rotation.x = (this.aimActive ? rig.adsRot.x : rig.baseRot.x) - recoil * 0.75;
  }

  private createZombie(type: ZombieActor['type'], x: number, z: number): ZombieActor {
    const scale = type === 'brute' ? 1.28 : type === 'runner' ? 0.9 : 1;
    const maxHp = type === 'brute' ? 230 : type === 'runner' ? 64 : 90;
    const speed = type === 'brute' ? 1.65 : type === 'runner' ? 4.45 : 2.35;
    const flesh = new THREE.MeshStandardMaterial({ color: type === 'runner' ? 0x715045 : type === 'brute' ? 0x343b32 : 0x536b4d, roughness: 0.9, flatShading: true });
    const clothing = new THREE.MeshStandardMaterial({ color: type === 'brute' ? 0x333338 : type === 'runner' ? 0x4b2526 : 0x303d46, roughness: 0.92, flatShading: true });
    const root = new THREE.Group();
    root.name = `zombie-${this.nextZombieId}`;
    root.scale.setScalar(scale);
    const torso = makeMesh(new THREE.BoxGeometry(0.47, 0.74, 0.29), clothing, 'zombie-torso');
    torso.position.set(0, 1.13, 0);
    root.add(torso);

    const head = makeMesh(new THREE.IcosahedronGeometry(0.22, 1), flesh, 'zombie-head');
    head.scale.set(0.88, 1.08, 0.86);
    head.position.set(0, 1.68, -0.015);
    head.userData.survivalHead = true;
    root.add(head);

    const eyeMat = new THREE.MeshBasicMaterial({ color: type === 'runner' ? 0xffbd55 : 0xf14a45 });
    for (const sign of [-1, 1]) {
      const eye = makeMesh(new THREE.SphereGeometry(0.035, 5, 4), eyeMat, 'zombie-eye');
      eye.position.set(sign * 0.075, 1.71, -0.2);
      root.add(eye);
    }

    const makeLimb = (name: string, x: number, y: number, material: THREE.Material, size: [number, number, number]) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = makeMesh(new THREE.BoxGeometry(...size), material, name);
      mesh.position.y = -size[1] / 2;
      pivot.add(mesh);
      root.add(pivot);
      return pivot;
    };
    const leftArm = makeLimb('zombie-left-arm', -0.34, 1.39, flesh, [0.16, 0.62, 0.17]);
    const rightArm = makeLimb('zombie-right-arm', 0.34, 1.39, flesh, [0.16, 0.62, 0.17]);
    const leftLeg = makeLimb('zombie-left-leg', -0.15, 0.73, clothing, [0.19, 0.72, 0.2]);
    const rightLeg = makeLimb('zombie-right-leg', 0.15, 0.73, clothing, [0.19, 0.72, 0.2]);

    const actor: ZombieActor = {
      id: this.nextZombieId++, type, root, head, torso, leftArm, rightArm, leftLeg, rightLeg,
      position: new THREE.Vector3(x, this.options.getTerrainHeight(x, z), z),
      hp: maxHp, maxHp, speed, damage: type === 'brute' ? 26 : type === 'runner' ? 11 : 15,
      attackRange: type === 'brute' ? 1.7 : 1.35, attackCooldown: type === 'runner' ? 0.82 : 1.12,
      lastAttack: 0, phase: Math.random() * Math.PI * 2, dead: false, deathAge: 0, flash: 0, flesh, clothing,
    };
    const mark = (mesh: THREE.Mesh) => { mesh.userData.survivalZombie = actor; };
    root.traverse(object => { if (object instanceof THREE.Mesh) mark(object); });
    root.position.copy(actor.position);
    root.rotation.y = Math.PI;
    this.scene.add(root);
    survivalSound.playZombieGrowl(type === 'brute' ? 0.62 : type === 'runner' ? 1.16 : 0.92);
    return actor;
  }

  private damageZombie(actor: ZombieActor, amount: number, headshot: boolean, playHitSound = true): void {
    if (actor.dead) return;
    actor.hp = Math.max(0, actor.hp - amount);
    actor.flash = 0.12;
    actor.flesh.emissive.setHex(0x7c211c);
    actor.clothing.emissive.setHex(0x3a1210);
    this.spawnImpact(actor.head.getWorldPosition(new THREE.Vector3()), true);
    if (playHitSound) survivalSound.playHitmarker(headshot);
    this.options.notify(headshot ? 'HEADSHOT!' : 'HIT');
    if (actor.hp <= 0) {
      survivalSound.playZombieDeath();
      actor.dead = true;
      actor.deathAge = 0;
      this.kills++;
      this.killedThisWave++;
      actor.root.rotation.z = -Math.PI / 2;
      actor.root.position.y = this.options.getTerrainHeight(actor.position.x, actor.position.z) + 0.25;
      this.dropLoot(actor.position);
      this.options.notify(headshot ? 'HEADSHOT · INFECTED ELIMINATED' : 'INFECTED ELIMINATED');
    }
  }

  private moveZombie(actor: ZombieActor, dx: number, dz: number): void {
    const scale = 1;
    const radius = 0.34 * (actor.type === 'brute' ? 1.3 : 1);
    const tryPos = (x: number, z: number) => {
      if (this.options.isWater(x, z) && this.options.getWaterDepth(x, z) > 0.65) return false;
      if (!this.options.canOccupy(x, z)) return false;
      actor.position.x = x;
      actor.position.z = z;
      return true;
    };
    const nx = actor.position.x + dx;
    const nz = actor.position.z + dz;
    if (tryPos(nx, nz)) return;
    const xMoved = tryPos(nx, actor.position.z);
    const zMoved = tryPos(actor.position.x, nz);
    if (!xMoved && !zMoved) {
      const sidestep = Math.sin(actor.phase) * radius * scale;
      tryPos(actor.position.x - dz * 2 + sidestep, actor.position.z + dx * 2);
      if (actor.position.x === nx && actor.position.z === nz) return;
    }
  }

  private updateZombie(actor: ZombieActor, dt: number, playerPos: THREE.Vector3, inSafeZone: boolean): void {
    if (actor.dead) {
      actor.deathAge += dt;
      actor.root.position.y = Math.max(this.options.getTerrainHeight(actor.position.x, actor.position.z) + 0.08, actor.root.position.y - dt * 0.16);
      actor.root.scale.multiplyScalar(Math.max(0.985, 1 - dt * 0.06));
      return;
    }

    actor.flash = Math.max(0, actor.flash - dt);
    if (actor.flash <= 0) {
      actor.flesh.emissive.setHex(0x000000);
      actor.clothing.emissive.setHex(0x000000);
    }
    actor.phase += dt * actor.speed * 4.2;
    actor.root.position.set(actor.position.x, this.options.getTerrainHeight(actor.position.x, actor.position.z), actor.position.z);

    let dx = playerPos.x - actor.position.x;
    let dz = playerPos.z - actor.position.z;
    let dist = Math.hypot(dx, dz);
    const safeZoneForZombie = this.nearestZone(actor.position.x, actor.position.z);
    if (safeZoneForZombie && distToZone(actor.position.x, actor.position.z, safeZoneForZombie) < safeZoneForZombie.radius + 0.3) {
      const zx = actor.position.x - safeZoneForZombie.x;
      const zz = actor.position.z - safeZoneForZombie.z;
      const length = Math.max(0.001, Math.hypot(zx, zz));
      this.moveZombie(actor, (zx / length) * dt * 2.1, (zz / length) * dt * 2.1);
    } else if (inSafeZone) {
      // Safe areas are actual sanctuaries, not just a HUD label: enemies retreat instead of camping the player.
      const length = Math.max(0.001, dist);
      this.moveZombie(actor, (-dx / length) * dt * Math.min(2.4, actor.speed), (-dz / length) * dt * Math.min(2.4, actor.speed));
    } else {
      const length = Math.max(0.001, dist);
      if (dist > actor.attackRange * 0.92) {
        const stride = actor.speed * dt;
        this.moveZombie(actor, (dx / length) * stride, (dz / length) * stride);
      } else if (this.hasLineOfSight(actor.position, playerPos)) {
        if (this.elapsed - actor.lastAttack >= actor.attackCooldown) {
          actor.lastAttack = this.elapsed;
          this.damagePlayer(actor.damage);
          actor.leftArm.rotation.x = -1.5;
          actor.rightArm.rotation.x = -1.5;
        }
      }
    }

    dx = playerPos.x - actor.position.x;
    dz = playerPos.z - actor.position.z;
    dist = Math.hypot(dx, dz);
    if (dist > 0.02) actor.root.rotation.y = Math.atan2(dx, dz);
    const swinging = !inSafeZone && dist <= actor.attackRange * 1.15;
    const swing = Math.sin(actor.phase) * (actor.type === 'runner' ? 0.66 : 0.43);
    actor.leftLeg.rotation.x = swing;
    actor.rightLeg.rotation.x = -swing;
    if (!swinging) {
      actor.leftArm.rotation.x = -swing * 0.7 - 0.18;
      actor.rightArm.rotation.x = swing * 0.7 - 0.18;
    }
  }

  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const origin = from.clone();
    origin.y += 1.05;
    const target = to.clone();
    target.y += 1.05;
    const direction = target.sub(origin);
    const distance = direction.length();
    if (distance < 0.1) return true;
    this.raycaster.set(origin, direction.normalize());
    this.raycaster.far = Math.max(0, distance - 0.3);
    const hits = this.raycaster.intersectObjects(this.options.getSightBlockers(), true);
    return hits.length === 0;
  }

  private damagePlayer(amount: number): void {
    if (this.isDead || this.inSafeZone(this.options.getPlayerPosition().x, this.options.getPlayerPosition().z)) return;
    this.activateAudio();
    survivalSound.playZombieAttack();
    survivalSound.playPlayerHurt();
    this.health = Math.max(0, this.health - amount);
    this.flashDamageTimer = 0.18;
    this.options.onDamage();
    this.options.notify(`TAKEN HIT · -${amount} HP`);
    if (this.health <= 0) {
      this.isDead = true;
      this.fireHeld = false;
      this.aimActive = false;
      this.options.onDeath();
      this.options.notify('YOU WERE OVERRUN');
    }
    this.emitStatus();
  }

  private dropLoot(position: THREE.Vector3): void {
    const roll = Math.random();
    if (roll > 0.56) return;
    const kind: SurvivalPickupKind = roll < 0.10 ? 'medkit' : 'ammo';
    const root = new THREE.Group();
    root.name = `survival-loot-${kind}`;
    const material = new THREE.MeshStandardMaterial({
      color: kind === 'medkit' ? 0xf1f5f9 : 0x71834a,
      emissive: kind === 'medkit' ? 0x7c2222 : 0x36451a,
      emissiveIntensity: 0.35, roughness: 0.6,
    });
    const box = makeMesh(new THREE.BoxGeometry(0.42, 0.26, 0.34), material, 'loot-box');
    root.add(box);
    if (kind === 'medkit') {
      const crossMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const crossV = makeMesh(new THREE.BoxGeometry(0.07, 0.2, 0.02), crossMat, 'medkit-cross');
      const crossH = makeMesh(new THREE.BoxGeometry(0.2, 0.07, 0.02), crossMat, 'medkit-cross');
      crossV.position.z = -0.18;
      crossH.position.z = -0.18;
      root.add(crossV, crossH);
    }
    root.position.set(position.x, this.options.getTerrainHeight(position.x, position.z) + 0.45, position.z);
    this.scene.add(root);
    this.loot.push({ root, kind, amount: kind === 'medkit' ? 35 : 18 + Math.floor(Math.random() * 16) });
  }

  private updateLoot(dt: number, playerPos: THREE.Vector3): void {
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const drop = this.loot[i];
      drop.root.rotation.y += dt * 0.7;
      drop.root.position.y = this.options.getTerrainHeight(drop.root.position.x, drop.root.position.z) + 0.4 + Math.sin(this.elapsed * 2.2 + i) * 0.07;
      if (drop.root.position.distanceTo(playerPos) > 1.25) continue;
      if (drop.kind === 'medkit') {
        if (this.health >= this.maxHealth) continue;
        this.health = Math.min(this.maxHealth, this.health + drop.amount);
        survivalSound.playPickup();
        this.options.notify(`FIRST AID +${drop.amount} HP`);
      } else {
        const weaponAmmo = this.ammo[this.weapon];
        weaponAmmo.reserve = Math.min(WEAPONS[this.weapon].reserveStart * 2, weaponAmmo.reserve + drop.amount);
        survivalSound.playPickup();
        this.options.notify(`AMMUNITION +${drop.amount}`);
      }
      this.scene.remove(drop.root);
      disposeGroup(drop.root);
      this.loot.splice(i, 1);
      this.emitStatus();
    }
  }

  private spawnImpact(position: THREE.Vector3, blood: boolean): void {
    const mesh = makeMesh(
      new THREE.SphereGeometry(blood ? 0.075 : 0.045, 5, 4),
      new THREE.MeshBasicMaterial({ color: blood ? 0x9e302d : 0xffc66d, transparent: true, opacity: 0.9 }),
      'survival-impact'
    );
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.hitSparks.push({ mesh, age: 0 });
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const material = new THREE.LineBasicMaterial({ color: 0xffd49a, transparent: true, opacity: 0.7 });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.tracerLines.push({ line, age: 0 });
  }

  private removeZombie(actor: ZombieActor): void {
    const index = this.zombies.indexOf(actor);
    if (index >= 0) this.zombies.splice(index, 1);
    this.scene.remove(actor.root);
    disposeGroup(actor.root);
  }

  private nearestZone(x: number, z: number): (SafeZoneDefinition & { root: THREE.Group }) | null {
    let found: (SafeZoneDefinition & { root: THREE.Group }) | null = null;
    let distance = Infinity;
    for (const zone of this.zones) {
      const d = distToZone(x, z, zone);
      if (d < distance) { distance = d; found = zone; }
    }
    return found;
  }

  private inSafeZone(x: number, z: number): boolean {
    const zone = this.nearestZone(x, z);
    return !!zone && distToZone(x, z, zone) <= zone.radius;
  }

  private spawnZombie(): void {
    if (this.zombies.filter(z => !z.dead).length >= this.maxZombies) return;
    const player = this.options.getPlayerPosition();
    for (let attempt = 0; attempt < 14; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 15 + Math.random() * 10;
      const x = player.x + Math.cos(angle) * radius;
      const z = player.z + Math.sin(angle) * radius;
      if (this.inSafeZone(x, z) || this.options.isWater(x, z) && this.options.getWaterDepth(x, z) > 0.55) continue;
      if (!this.options.canOccupy(x, z)) continue;
      const roll = Math.random();
      const type: ZombieActor['type'] = this.wave >= 3 && roll > 0.88 ? 'brute' : this.wave >= 2 && roll > 0.60 ? 'runner' : 'walker';
      this.zombies.push(this.createZombie(type, x, z));
      return;
    }
  }

  private updateZones(): void {
    for (const zone of this.zones) {
      zone.root.position.set(zone.x, this.options.getTerrainHeight(zone.x, zone.z), zone.z);
      zone.root.visible = this.enabled;
    }
  }

  update(dt: number, firing = false, aiming = false): void {
    if (!this.enabled) return;
    this.elapsed += dt;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.statusTimer += dt;
    this.setAim(aiming);

    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0) this.finishReload();
    }
    const definition = WEAPONS[this.weapon];
    if ((firing || this.fireHeld) && definition.automatic && this.fireCooldown <= 0) this.fire();

    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
    for (const [id, rig] of this.weaponRigs) {
      const active = this.enabled && id === this.weapon;
      rig.root.visible = active;
      rig.muzzleFlash.visible = active && this.muzzleTimer > 0;
      setRigFlashOpacity(rig, active ? Math.min(0.95, 0.95 * (this.muzzleTimer / 0.065)) : 0);
      rig.muzzleLight.intensity = active && this.muzzleTimer > 0
        ? (this.options.lowPowerMode ? 0.8 : 1.5) * (this.muzzleTimer / 0.065)
        : 0;
    }
    const activeRig = this.weaponRigs.get(this.weapon);
    if (activeRig) {
      const base = this.aimActive ? activeRig.adsPos : activeRig.basePos;
      const weaponBase = base.clone();
      weaponBase.y += Math.sin(this.elapsed * 7) * (this.aimActive ? 0.001 : 0.003);
      weaponBase.z += Math.cos(this.elapsed * 8) * (this.aimActive ? 0.002 : 0.005);
      weaponBase.z += Math.max(0, activeRig.root.position.z - base.z) * Math.exp(-dt * WEAPONS[this.weapon].recoilRecovery);
      activeRig.root.position.lerp(weaponBase, Math.min(1, dt * 12));
      activeRig.root.rotation.x += ((this.aimActive ? activeRig.adsRot.x : activeRig.baseRot.x) - activeRig.root.rotation.x) * Math.min(1, dt * 8);
      if (activeRig.slideOrPump) {
        const baseZ = this.slideBaseZ.get(this.weapon) ?? activeRig.slideOrPump.position.z;
        const reloadDuration = WEAPONS[this.weapon].reloadTime;
        const reloadProgress = this.reloadTimer > 0 ? 1 - this.reloadTimer / reloadDuration : 1;
        const travel = this.weapon === 'shotgun' ? 0.11 : 0.035;
        const reloadOffset = this.reloadTimer > 0 ? Math.sin(reloadProgress * Math.PI) * travel : 0;
        activeRig.slideOrPump.position.z = baseZ + reloadOffset;
      }
    }
    this.updateZones();

    const playerPos = this.options.getPlayerPosition();
    const nearSafe = this.inSafeZone(playerPos.x, playerPos.z);
    if (!nearSafe && !this.hasEnteredHostileArea) {
      this.hasEnteredHostileArea = true;
      this.wave = 1;
      this.waveQueue = 4;
      this.spawnTimer = 0.6;
      this.options.notify('HOSTILE TERRITORY · FIND COVER');
    }

    if (!this.isDead && this.hasEnteredHostileArea && !nearSafe) {
      if (this.waveQueue > 0) {
        this.spawnTimer += dt;
        if (this.spawnTimer >= 2.7 && this.zombies.filter(z => !z.dead).length < this.maxZombies) {
          this.spawnTimer = 0;
          this.spawnZombie();
          this.waveQueue--;
        }
      } else if (this.zombies.every(z => z.dead) && this.zombies.length === 0) {
        this.breakTimer += dt;
        if (this.breakTimer > 7) {
          this.breakTimer = 0;
          this.wave++;
          this.waveQueue = Math.min(3 + this.wave, this.maxZombies);
          this.options.notify(`WAVE ${this.wave} · CONTACT`);
        }
      }
    } else if (nearSafe) {
      this.spawnTimer = Math.max(0, this.spawnTimer - dt * 0.5);
    }

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const actor = this.zombies[i];
      this.updateZombie(actor, dt, playerPos, nearSafe);
      if (actor.dead && actor.deathAge > 6) this.removeZombie(actor);
    }
    this.updateLoot(dt, playerPos);
    this.updateTraces(dt);
    if (this.flashDamageTimer > 0) this.flashDamageTimer = Math.max(0, this.flashDamageTimer - dt);

    if (this.statusTimer >= 0.12) {
      this.statusTimer = 0;
      this.emitStatus();
    }
  }

  private updateTraces(dt: number): void {
    for (let i = this.tracerLines.length - 1; i >= 0; i--) {
      const trace = this.tracerLines[i];
      trace.age += dt;
      if (trace.age < 0.055) continue;
      this.scene.remove(trace.line);
      trace.line.geometry.dispose();
      (trace.line.material as THREE.Material).dispose();
      this.tracerLines.splice(i, 1);
    }
    for (let i = this.hitSparks.length - 1; i >= 0; i--) {
      const spark = this.hitSparks[i];
      spark.age += dt;
      (spark.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - spark.age / 0.13);
      if (spark.age < 0.13) continue;
      this.scene.remove(spark.mesh);
      disposeGroup(spark.mesh);
      this.hitSparks.splice(i, 1);
    }
  }

  restart(): void {
    for (const actor of [...this.zombies]) this.removeZombie(actor);
    for (const drop of this.loot) {
      this.scene.remove(drop.root);
      disposeGroup(drop.root);
    }
    this.loot.length = 0;
    this.health = this.maxHealth;
    this.kills = 0;
    this.wave = 0;
    this.isDead = false;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.hasEnteredHostileArea = false;
    this.waveQueue = 0;
    this.spawnTimer = 0;
    this.breakTimer = 0;
    this.ammo = {
      pistol: { mag: 15, reserve: WEAPONS.pistol.reserveStart },
      shotgun: { mag: 8, reserve: WEAPONS.shotgun.reserveStart },
      rifle: { mag: 30, reserve: WEAPONS.rifle.reserveStart },
    };
    this.weapon = 'pistol';
    this.options.respawnPlayer();
    this.options.notify('You are back at the safe zone');
    this.emitStatus();
  }

  getRadarState(): SurvivalRadarState {
    return {
      safeZones: this.zones.map(({ id, label, x, z, radius }) => ({ id, label, x, z, radius })),
      zombies: this.zombies
        .filter(actor => !actor.dead)
        .map(actor => ({ x: actor.position.x, z: actor.position.z, type: actor.type })),
    };
  }

  private status(): SurvivalStatus {
    const p = this.options.getPlayerPosition();
    const nearest = this.nearestZone(p.x, p.z);
    const ammo = this.ammo[this.weapon];
    const living = this.zombies.filter(z => !z.dead).length;
    return {
      enabled: this.enabled, health: this.health, maxHealth: this.maxHealth,
      weapon: this.weapon, weaponLabel: WEAPONS[this.weapon].label,
      ammoInMag: ammo.mag, ammoReserve: ammo.reserve, kills: this.kills, wave: this.wave,
      livingZombies: living, inSafeZone: this.inSafeZone(p.x, p.z),
      nearestZone: nearest?.label ?? 'SAFE ZONE',
      zoneDistance: nearest ? Math.max(0, distToZone(p.x, p.z, nearest) - nearest.radius) : 0,
      reloading: this.reloadTimer > 0, dead: this.isDead,
    };
  }

  private emitStatus(): void {
    this.setSurvivalAudioHealth(this.health / this.maxHealth);
    this.options.onStatus(this.status());
  }

  dispose(): void {
    for (const actor of [...this.zombies]) this.removeZombie(actor);
    for (const drop of this.loot) {
      this.scene.remove(drop.root);
      disposeGroup(drop.root);
    }
    for (const trace of this.tracerLines) {
      this.scene.remove(trace.line);
      trace.line.geometry.dispose();
      (trace.line.material as THREE.Material).dispose();
    }
    for (const spark of this.hitSparks) {
      this.scene.remove(spark.mesh);
      disposeGroup(spark.mesh);
    }
    for (const zone of this.zones) {
      this.scene.remove(zone.root);
      disposeGroup(zone.root);
    }
    for (const rig of this.weaponRigs.values()) {
      this.camera.remove(rig.root);
      disposeGroup(rig.root);
    }
    this.weaponRigs.clear();
  }
}

function distToZone(x: number, z: number, zone: SafeZoneDefinition): number {
  return Math.hypot(x - zone.x, z - zone.z);
}
