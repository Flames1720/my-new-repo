import * as THREE from 'three';
import { clamp } from './terrain';
import { createWeaponRig, type SurvivalWeaponId, type WeaponRig, SURVIVAL_WEAPON_REGISTRY } from './survival-weapons';
import { survivalSound } from './survival-audio';
import { settings } from './settings';
import { CombatEffects } from './combat-effects';
import { ShotTargets } from './shot-targets';
import { batchZombieBody } from './zombie-body';
export type { SurvivalWeaponId } from './survival-weapons';
export type SurvivalPickupKind = 'ammo' | 'medkit';

export interface SafeZoneDefinition {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
}

type SafeZonePhase = 'stable' | 'weakening' | 'collapsed';
type RuntimeSafeZone = SafeZoneDefinition & { root: THREE.Group; active: boolean; age: number; integrity: number; phase: SafeZonePhase };

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
  waveIntroActive?: boolean;
  livingZombies: number;
  inSafeZone: boolean;
  nearestZone: string;
  zoneDistance: number;
  reloading: boolean;
  dead: boolean;
  runComplete?: boolean;
  preparationSeconds?: number;
  durationSeconds?: number;
  bossKills?: number;
  distanceMeters?: number;
  skillCooldownSeconds?: number;
  pulseActiveSeconds?: number;
  medicActiveSeconds?: number;
  zonePhase?: SafeZonePhase;
  zoneIntegrity?: number;
  safeZoneX?: number;
  safeZoneZ?: number;
}

export interface ZombieSurvivalOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  getPlayerPosition: () => THREE.Vector3;
  getTerrainHeight: (x: number, z: number) => number;
  getNightFactor?: () => number;
  isFirstPerson?: () => boolean;
  getMovementSpeed?: () => number;
  performanceActive?: () => boolean;
  onPerformanceCost?: (phase: 'fire' | 'enemyAI' | 'combatEffects', ms: number) => void;
  isWater: (x: number, z: number) => boolean;
  getWaterDepth: (x: number, z: number) => number;
  canOccupy: (x: number, z: number) => boolean;
  canSpawnAt?: (x: number, z: number) => boolean;
  getSightBlockers: () => THREE.Object3D[];
  safeZones: SafeZoneDefinition[];
  lowPowerMode: boolean;
  respawnPlayer: () => void;
  notify: (message: string) => void;
  onStatus: (status: SurvivalStatus) => void;
  onShot?: (hit: boolean) => void;
  onDamage: () => void;
  onHealing?: (amount: number) => void;
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
  brainTier: number;
  flanker: boolean;
  flankSide: number;
  bossTier: 0 | 1 | 2;
  lastZoneDamage: number;
  flesh: THREE.MeshStandardMaterial;
  clothing: THREE.MeshStandardMaterial;
  bodyMaterial: THREE.MeshStandardMaterial;
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
  // Weapon update runs every active frame. Avoid walking every muzzle-flash mesh
  // when its opacity already has the requested value (especially while idle).
  const previousOpacity = rig.root.userData.appliedMuzzleFlashOpacity as number | undefined;
  if (previousOpacity === opacity) return;
  rig.root.userData.appliedMuzzleFlashOpacity = opacity;
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
  public enabled = false;
  public isDead = false;
  public health = 100;
  public maxHealth = 100;
  private damageMultiplier = 1;
  public kills = 0;
  public wave = 0;
  public weapon: SurvivalWeaponId = 'pistol';
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;

  private readonly options: ZombieSurvivalOptions;
  private readonly zones: RuntimeSafeZone[] = [];
  private readonly zombies: ZombieActor[] = [];
  private readonly loot: LootDrop[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly centerNdc = new THREE.Vector2(0, 0);
  private readonly intersections: THREE.Intersection[] = [];
  private readonly shotTargets = new ShotTargets();
  private readonly shotMuzzle = new THREE.Vector3();
  private readonly shotEndpoint = new THREE.Vector3();
  // Reuse line-of-sight scratch state. AI checks run repeatedly as infected close in.
  private readonly sightOrigin = new THREE.Vector3();
  private readonly sightDirection = new THREE.Vector3();
  private readonly sightIntersections: THREE.Intersection[] = [];
  private readonly weaponBaseScratch = new THREE.Vector3();
  private currentSightBlockers: THREE.Object3D[] | null = null;
  private readonly combatEffects: CombatEffects;
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
  private bossKills = 0;
  private distanceMeters = 0;
  private previousTravelPosition: THREE.Vector3 | null = null;
  private fieldEffects: Partial<Record<'quick-hands' | 'steady-grip' | 'reinforced-vest' | 'sharpshooter' | 'scavenger', number>> = {};
  private activeReloadDuration = 1;

  activateFieldEffect(id: 'quick-hands' | 'steady-grip' | 'reinforced-vest' | 'sharpshooter' | 'scavenger'): boolean {
    if (!this.enabled || this.isDead) return false;
    this.fieldEffects[id] = id === 'scavenger' ? 20 : id === 'reinforced-vest' ? 8 : 10;
    return true;
  }

  private spawnTimer = 0;
  private waveIntroTimer = 0;
  private waveQueue = 0;
  private breakTimer = 0;
  private hasEnteredHostileArea = false;
  private statusTimer = 0;
  private flashDamageTimer = 0;
  private lastFov = 62;
  private nextZombieId = 1;
  private maxZombies: number;
  private killedThisWave = 0;
  private preparationTimer = 0;
  private skillCooldown = 0;
  private pulseRemaining = 0;
  private pulseBeat = 0;
  private medicRemaining = 0;
  private medicBeat = 0;
  private medicCooldown = 0;
  private cardFields: THREE.Group | null = null;
  private zoneTransitionTimer = 0;
  private nextZoneIndex = 1;
  private bossSpawnedThisWave = false;
  public runComplete = false;

  constructor(options: ZombieSurvivalOptions) {
    this.options = options;
    this.scene = options.scene;
    this.camera = options.camera;
    this.combatEffects = new CombatEffects(this.scene);
    this.maxZombies = options.lowPowerMode ? 5 : 9;

    for (const def of options.safeZones) {
      const root = this.createSafeZone(def);
      const active = this.zones.length === 0;
      root.visible = active && this.enabled;
      this.scene.add(root);
      this.zones.push({ ...def, root, active, age: 0, integrity: 100, phase: 'stable' });
    }

    this.createWeaponRigs();
    for (const [id, rig] of this.weaponRigs) {
      // Emissive flash meshes avoid a changing point-light shader variant on mobile.
      rig.muzzleLight.removeFromParent();
      this.camera.add(rig.root);
      rig.root.visible = this.enabled && id === this.weapon;
      rig.muzzleFlash.visible = false;
      rig.muzzleLight.intensity = 0;
    }
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

    // An energy perimeter and low dome make the sanctuary readable from afar.
    const wall = makeMesh(
      new THREE.CylinderGeometry(def.radius, def.radius, 5.2, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x36f89a, transparent: true, opacity: 0.075, depthWrite: false, side: THREE.DoubleSide }),
      'safe-zone-energy-wall'
    );
    wall.position.y = 2.6;
    root.add(wall);
    const dome = makeMesh(
      new THREE.SphereGeometry(def.radius, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x62ffb0, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide }),
      'safe-zone-energy-dome'
    );
    dome.scale.y = 0.58;
    root.add(dome);

    // Bright rings sweep upward; perimeter nodes drift around the field edge.
    for (let i = 0; i < 3; i++) {
      const band = makeMesh(
        new THREE.TorusGeometry(def.radius, 0.045, 5, 72),
        new THREE.MeshBasicMaterial({ color: 0x8dffc6, transparent: true, opacity: 0.82, depthWrite: false }),
        `safe-zone-wave-${i}`
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.45 + i * 1.9;
      root.add(band);
    }
    const nodeGeometry = new THREE.SphereGeometry(0.11, 7, 5);
    const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0xc0ffda });
    for (let i = 0; i < 12; i++) {
      const node = makeMesh(nodeGeometry, nodeMaterial, `safe-zone-node-${i}`);
      node.userData.barrierPhase = i / 12 * Math.PI * 2;
      root.add(node);
    }

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
    this.zones.forEach(zone => (zone.root.visible = enabled && zone.active && zone.phase !== 'collapsed'));
    this.zombies.forEach(actor => (actor.root.visible = enabled));
    this.loot.forEach(drop => (drop.root.visible = enabled));
    if (!enabled) this.muzzleTimer = 0;
    for (const [id, rig] of this.weaponRigs) {
      rig.root.visible = enabled && id === this.weapon && (this.options.isFirstPerson?.() ?? true);
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
      this.combatEffects.clear();
      this.pulseRemaining = this.pulseBeat = this.medicRemaining = this.medicBeat = 0;
      if (this.cardFields) this.cardFields.children.forEach(ring => ring.visible = false);
    }
    this.emitStatus();
  }

  activateAudio(): void {
    // Call only from a real key/pointer interaction so mobile browsers can unlock Web Audio.
    survivalSound.init();
    survivalSound.setVolumes(settings.current.audioMaster, settings.current.audioSfx);
  }

  setAmbientEnabled(enabled: boolean): void {
    survivalSound.setAmbientEnabled(enabled);
  }

  setPermanentUpgrades(healthLevels: number, damageLevels: number): void {
    this.maxHealth = 100 + Math.max(0, Math.min(5, Math.floor(healthLevels))) * 10;
    this.damageMultiplier = 1 + Math.max(0, Math.min(5, Math.floor(damageLevels))) * 0.05;
    this.health = this.maxHealth;
    this.emitStatus();
  }

  restoreHealth(amount: number): boolean {
    if (!this.enabled || this.isDead || amount <= 0 || this.health >= this.maxHealth) return false;
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + Math.round(amount));
    this.options.notify(`FIELD MEDIC · +${this.health - before} HP`);
    this.emitStatus();
    return this.health > before;
  }

  beginPreparation(seconds = 12): void {
    this.preparationTimer = Math.max(0, seconds);
    this.hasEnteredHostileArea = false;
    this.wave = 0;
    this.waveQueue = 0;
    this.spawnTimer = 0;
    this.options.notify(`PREPARE · FIRST WAVE IN ${Math.ceil(this.preparationTimer)}s`);
    this.emitStatus();
  }

  setSurvivalAudioHealth(healthRatio: number): void {
    survivalSound.updateHeartbeat(this.enabled ? Math.max(0, Math.min(1, healthRatio)) : 1);
  }

  setFireHeld(held: boolean): void {
    this.fireHeld = held;
  }

  setAim(aiming: boolean, dt = 1 / 60): void {
    this.aimActive = aiming && this.enabled && !this.isDead;
    const wantedFov = this.aimActive ? 47 : this.lastFov;
    // Frame-rate-independent, rapid ADS response; no long exponential tail.
    const blend = Math.min(1, 1 - Math.exp(-Math.max(0, dt) * 38));
    const nextFov = this.camera.fov + (wantedFov - this.camera.fov) * blend;
    if (Math.abs(nextFov - this.camera.fov) > 0.005 || Math.abs(wantedFov - this.camera.fov) > 0.005) {
      this.camera.fov = Math.abs(wantedFov - nextFov) < 0.05 ? wantedFov : nextFov;
      this.camera.updateProjectionMatrix();
    }
  }

  activateSkill(): boolean {
    if (!this.enabled || this.isDead || this.runComplete || this.skillCooldown > 0) return false;
    this.skillCooldown = 18;
    this.pulseRemaining = 6;
    this.pulseBeat = 0;
    this.repelPulse();
    this.ensureCardFields();
    this.updateCardFields(0);
    this.emitStatus();
    return true;
  }

  activateMedic(): boolean {
    if (!this.enabled || this.isDead || this.runComplete || this.medicCooldown > 0 || this.health >= this.maxHealth) return false;
    this.medicCooldown = 24;
    this.medicRemaining = 12;
    this.medicBeat = 0;
    this.ensureCardFields();
    this.updateCardFields(0);
    this.emitStatus();
    return true;
  }

  private ensureCardFields(): void {
    if (this.cardFields) return;
    this.cardFields = new THREE.Group();
    for (const [radius, color] of [[7.5, 0xf5b544], [2, 0x4ade80]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .12, radius, 32), new THREE.MeshBasicMaterial({color, transparent:true, opacity:.55, side:THREE.DoubleSide, depthWrite:false}));
      ring.rotation.x = -Math.PI / 2;
      this.cardFields.add(ring);
    }
    this.scene.add(this.cardFields);
  }

  private repelPulse(): void {
    const player = this.options.getPlayerPosition();
    for (const actor of this.zombies) {
      if (actor.dead) continue;
      let dx = actor.position.x - player.x, dz = actor.position.z - player.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 7.5) continue;
      if (distance < .001) { dx = 1; dz = 0; }
      const length = Math.max(.001, Math.hypot(dx, dz));
      const push = actor.bossTier > 0 ? .2 : actor.type === 'brute' ? .5 : 2.2;
      this.moveZombie(actor, dx / length * push, dz / length * push);
    }
  }

  private updateCardFields(dt: number): void {
    if (this.isDead) { this.pulseRemaining = 0; this.medicRemaining = 0; }
    const pulseTime = Math.min(dt, this.pulseRemaining);
    this.pulseRemaining = Math.max(0, this.pulseRemaining - dt);
    if (this.pulseRemaining < 1e-9) this.pulseRemaining = 0;
    this.pulseBeat += pulseTime;
    while (this.pulseBeat >= .75 && this.pulseRemaining > 0) { this.pulseBeat -= .75; this.repelPulse(); }
    const medicTime = Math.min(dt, this.medicRemaining);
    this.medicRemaining = Math.max(0, this.medicRemaining - dt);
    if (this.medicRemaining < 1e-9) this.medicRemaining = 0;
    this.medicBeat += medicTime;
    // Damage runs first. A lethal hit ends the field without resurrecting the player.
    while (this.medicBeat >= 1 - 1e-9 && !this.isDead) {
      this.medicBeat = Math.max(0, this.medicBeat - 1);
      const before = this.health;
      this.health = Math.min(this.maxHealth, this.health + 3);
      if (this.health > before) { this.options.onHealing?.(this.health - before); this.emitStatus(); }
    }
    this.medicCooldown = Math.max(0, this.medicCooldown - dt);
    if (this.cardFields) {
      const player = this.options.getPlayerPosition();
      this.cardFields.position.set(player.x, this.options.getTerrainHeight(player.x, player.z) + .12, player.z);
      this.cardFields.children[0].visible = this.pulseRemaining > 0;
      this.cardFields.children[0].scale.setScalar(.45 + (this.pulseBeat / .75) * .55);
      this.cardFields.children[1].visible = this.medicRemaining > 0;
      this.cardFields.children[1].scale.setScalar(.85 + this.medicBeat * .15);
    }
  }

  switchWeapon(id: SurvivalWeaponId): void {
    if (this.isDead) return;
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
    const started = this.options.performanceActive?.() ? performance.now() : null;
    try { this.fireShot(); } finally { if (started !== null) this.options.onPerformanceCost?.('fire', performance.now() - started); }
  }

  private fireShot(): void {
    if (!this.enabled || this.isDead || this.reloadTimer > 0 || this.fireCooldown > 0) return;
    this.activateAudio();
    const definition = WEAPONS[this.weapon];
    const currentAmmo = this.ammo[this.weapon];
    if (currentAmmo.mag <= 0) {
      if (currentAmmo.reserve > 0) { this.reload(); return; }
      survivalSound.playDryFire();
      this.options.notify('No ammunition left');
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

    this.camera.updateWorldMatrix(true, true);
    const blockers = this.options.getSightBlockers();
    const targets = this.zombies.filter(z => !z.dead).map(z => z.root);
    const rayObjects = this.shotTargets.prepare([...blockers, ...targets]);
    // Aimed single-projectile weapons fire through the crosshair. Keep hip-fire
    // inaccuracy and centred shotgun pellet spread as intentional weapon behavior.
    const totalSpread = this.aimActive && definition.pellets === 1
      ? 0
      : definition.spread * (this.aimActive ? 0.42 : 1) * (this.fieldEffects['steady-grip'] ? 0.5 : 1);
    const muzzle = this.shotMuzzle;
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
      this.raycaster.intersectObjects(rayObjects, false, this.intersections);
      const hit = this.intersections[0];
      const end = this.shotEndpoint.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, definition.range);
      if (hit) {
        end.copy(hit.point);
        const actor = hit.object.userData.survivalZombie as ZombieActor | undefined;
        if (actor && !actor.dead) {
          const headshot = hit.object.userData.survivalHead === true;
          const damage = definition.damage * (headshot ? 2.45 : 1) * (this.fieldEffects.sharpshooter ? 1.5 : 1);
          this.damageZombie(actor, damage, headshot, !registeredHit);
          registeredHit = true;
        } else {
          this.spawnImpact(hit.point, false);
        }
      }
      // Keep crosshair targeting authoritative while drawing the trail from
      // the actual barrel to that endpoint, including each shotgun pellet.
      this.spawnTracer(muzzle, end);
    }
    this.options.onShot?.(registeredHit);
    if (currentAmmo.mag === 0 && currentAmmo.reserve > 0) this.reload();
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
    this.activeReloadDuration = definition.reloadTime * (this.fieldEffects['quick-hands'] ? 0.6 : 1);
    this.reloadTimer = this.activeReloadDuration;
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

  private createZombie(type: ZombieActor['type'], x: number, z: number, bossTier: 0 | 1 | 2 = 0): ZombieActor {
    const difficulty = 1 + Math.min(0.9, Math.max(0, this.wave - 1) * 0.012);
    const scale = bossTier === 2 ? 1.68 : bossTier === 1 ? 1.42 : type === 'brute' ? 1.28 : type === 'runner' ? 0.9 : 1;
    const maxHp = (bossTier === 2 ? 920 : bossTier === 1 ? 470 : type === 'brute' ? 230 : type === 'runner' ? 64 : 90) * difficulty;
    const speed = (type === 'brute' ? 1.65 : type === 'runner' ? 4.45 : 2.35) * (1 + Math.min(0.35, Math.max(0, this.wave - 1) * 0.004));
    // Brighter, distinct palettes keep infected readable against grass, trees and roads.
    const flesh = new THREE.MeshStandardMaterial({
      color: type === 'runner' ? 0xc27b58 : type === 'brute' ? 0x777b70 : 0x8ebd70,
      roughness: 0.86, flatShading: true,
      emissive: type === 'runner' ? 0x351006 : type === 'brute' ? 0x151c0b : 0x142a08,
      emissiveIntensity: 0.24,
    });
    const clothing = new THREE.MeshStandardMaterial({
      color: type === 'brute' ? 0x514b5b : type === 'runner' ? 0x9b3826 : 0x354d63,
      roughness: 0.9, flatShading: true,
      emissive: type === 'runner' ? 0x2e0802 : 0x080b10,
      emissiveIntensity: 0.18,
    });
    const root = new THREE.Group();
    root.name = `zombie-${this.nextZombieId}`;
    root.scale.setScalar(scale);
    const torso = makeMesh(new THREE.BoxGeometry(0.47, 0.74, 0.29), clothing, 'zombie-torso');
    torso.position.set(0, 1.13, 0);
    root.add(torso);
    // High-contrast chest strip gives each silhouette a readable focal point.
    const warningMat = new THREE.MeshBasicMaterial({ color: bossTier === 2 ? 0xff315b : bossTier === 1 ? 0xff8a35 : type === 'brute' ? 0xf1c453 : type === 'runner' ? 0xff6a35 : 0xd9e8b1 });
    const chestMark = makeMesh(new THREE.BoxGeometry(0.34, 0.095, 0.018), warningMat, 'zombie-chest-mark');
    chestMark.position.set(0, 1.22, -0.158);
    root.add(chestMark);

    const head = makeMesh(new THREE.IcosahedronGeometry(0.22, 1), flesh, 'zombie-head');
    head.scale.set(type === 'brute' ? 1.12 : type === 'runner' ? 0.78 : 0.88, type === 'runner' ? 1.16 : 1.08, 0.86);
    head.position.set(0, 1.68, -0.015);
    head.userData.survivalHead = true;
    root.add(head);

    // Bake facial features into one vertex-colored mesh: sockets, brow, jaw and
    // teeth stay readable on mobile without adding a draw call per feature.
    const facePositions: number[] = [];
    const faceNormals: number[] = [];
    const faceColors: number[] = [];
    const faceWidth = type === 'brute' ? 1.2 : type === 'runner' ? 0.85 : 1;
    const skin = flesh.color.getHex();
    const feature = (size: [number, number, number], position: [number, number, number], color: number, tilt = 0) => {
      const geometry = new THREE.BoxGeometry(...size).toNonIndexed();
      geometry.rotateZ(tilt);
      geometry.translate(position[0] * faceWidth, position[1], position[2]);
      const positions = geometry.getAttribute('position');
      const normals = geometry.getAttribute('normal');
      const tint = new THREE.Color(color);
      for (let i = 0; i < positions.count; i++) {
        facePositions.push(positions.getX(i), positions.getY(i), positions.getZ(i));
        faceNormals.push(normals.getX(i), normals.getY(i), normals.getZ(i));
        faceColors.push(tint.r, tint.g, tint.b);
      }
      geometry.dispose();
    };
    for (const sign of [-1, 1]) {
      feature([0.105, 0.078, 0.035], [sign * 0.075, 1.715, -0.193], 0x20251d, sign * -0.14);
      feature([0.043, 0.024, 0.015], [sign * 0.076, 1.714, -0.218], type === 'runner' ? 0xffbc62 : bossTier ? 0xff614b : 0xe5dd99);
      feature([0.125, type === 'brute' ? 0.048 : 0.032, 0.045], [sign * 0.076, 1.766, -0.192], skin, sign * 0.18);
      feature([0.065, 0.055, 0.038], [sign * 0.116, 1.65, -0.183], skin, sign * -0.2);
    }
    feature([0.045, 0.078, 0.063], [0, 1.681, -0.217], skin);
    feature([0.143, type === 'runner' ? 0.084 : 0.057, 0.03], [0, 1.602, -0.181], 0x29201e, -0.08);
    feature([0.145, 0.044, 0.054], [0.008, 1.557, -0.15], skin, -0.08);
    for (const x of [-0.047, -0.018, 0.039]) {
      feature([0.019, 0.026, 0.014], [x, 1.624, -0.204], 0xc6baa0);
    }
    feature([0.019, 0.088, 0.014], [-0.135, 1.755, -0.153], 0x61443b, -0.28);
    const faceGeometry = new THREE.BufferGeometry();
    faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(facePositions, 3));
    faceGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(faceNormals, 3));
    faceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(faceColors, 3));
    const face = makeMesh(faceGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), 'zombie-face');
    face.userData.survivalHead = true;
    root.add(face);
    // The runners are narrow and hunched; brutes carry a broader upper body.
    torso.scale.set(type === 'brute' ? 1.24 : type === 'runner' ? 0.82 : 1, 1, 1);
    if (type === 'runner') torso.rotation.x = -0.12;

    const makeLimb = (name: string, x: number, y: number, material: THREE.Material, size: [number, number, number]) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = makeMesh(new THREE.BoxGeometry(...size), material, name);
      mesh.position.y = -size[1] / 2;
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
      pivot.add(mesh);
      root.add(pivot);
      return pivot;
    };
    const leftArm = makeLimb('zombie-left-arm', -0.34, 1.39, flesh, [0.16, 0.62, 0.17]);
    const rightArm = makeLimb('zombie-right-arm', 0.34, 1.39, flesh, [0.16, 0.62, 0.17]);
    const leftLeg = makeLimb('zombie-left-leg', -0.15, 0.73, clothing, [0.19, 0.72, 0.2]);
    const rightLeg = makeLimb('zombie-right-leg', 0.15, 0.73, clothing, [0.19, 0.72, 0.2]);
    const bodyMaterial = batchZombieBody(root, [torso, head, face]);

    const actor: ZombieActor = {
      id: this.nextZombieId++, type, root, head, torso, leftArm, rightArm, leftLeg, rightLeg,
      position: new THREE.Vector3(x, this.options.getTerrainHeight(x, z), z),
      hp: maxHp, maxHp, speed, damage: bossTier === 2 ? 42 : bossTier === 1 ? 32 : type === 'brute' ? 26 : type === 'runner' ? 11 : 15,
      attackRange: bossTier > 0 ? 2.15 : type === 'brute' ? 1.7 : 1.35, attackCooldown: bossTier > 0 ? 1.75 : type === 'runner' ? 0.82 : 1.12,
      lastAttack: 0, phase: Math.random() * Math.PI * 2, dead: false, deathAge: 0, flash: 0,
      brainTier: Math.min(3, Math.floor(this.wave / 4)), flanker: this.wave >= 7 && Math.random() < 0.32,
      flankSide: Math.random() < 0.5 ? -1 : 1, bossTier, lastZoneDamage: 0, flesh, clothing, bodyMaterial,
    };
    const mark = (mesh: THREE.Mesh) => { mesh.userData.survivalZombie = actor; };
    root.traverse(object => { if (object instanceof THREE.Mesh) mark(object); });
    root.position.copy(actor.position);
    root.rotation.y = Math.PI;
    this.scene.add(root);
    survivalSound.playZombieGrowl(type === 'brute' ? 0.62 : type === 'runner' ? 1.16 : 0.92);
    return actor;
  }

  private damageZombie(actor: ZombieActor, amount: number, headshot: boolean, playHitSound = true, quiet = false, quietDeathLabel = 'SANCTUARY PURGED AN INFECTED', scaleWithUpgrade = true): void {
    if (actor.dead) return;
    actor.hp = Math.max(0, actor.hp - amount * (scaleWithUpgrade ? this.damageMultiplier : 1));
    actor.flash = 0.12;
    actor.flesh.emissive.setHex(0x7c211c);
    actor.clothing.emissive.setHex(0x3a1210);
    actor.bodyMaterial.emissive.setHex(0x7c211c);
    this.spawnImpact(actor.head.getWorldPosition(new THREE.Vector3()), true);
    if (playHitSound) survivalSound.playHitmarker(headshot);
    if (!quiet) this.options.notify(headshot ? 'HEADSHOT!' : 'HIT');
    if (actor.hp <= 0) {
      survivalSound.playZombieDeath();
      actor.dead = true;
      actor.deathAge = 0;
      this.kills++;
      if (actor.bossTier > 0) this.bossKills++;
      this.killedThisWave++;
      actor.root.rotation.z = -Math.PI / 2;
      actor.root.position.y = this.options.getTerrainHeight(actor.position.x, actor.position.z) + 0.25;
      this.dropLoot(actor.position);
      this.options.notify(quiet ? quietDeathLabel : headshot ? 'HEADSHOT · INFECTED ELIMINATED' : 'INFECTED ELIMINATED');
    }
  }

  private moveZombie(actor: ZombieActor, dx: number, dz: number): void {
    const stride = Math.max(0.0001, Math.hypot(dx, dz));
    const startX = actor.position.x, startZ = actor.position.z;
    const tryPos = (x: number, z: number) => {
      if (this.options.isWater(x, z) && this.options.getWaterDepth(x, z) > 0.65) return false;
      if (!this.options.canOccupy(x, z)) return false;
      actor.position.x = x; actor.position.z = z; return true;
    };
    if (tryPos(startX + dx, startZ + dz)) return;
    if (tryPos(startX + dx, startZ) || tryPos(startX, startZ + dz)) return;
    // Obstacle-aware steering: try progressively wider arcs around trunks, walls and rocks.
    // Higher-wave infected search more directions instead of repeatedly walking into the same collider.
    const baseAngle = Math.atan2(dz, dx);
    const arcs = actor.brainTier >= 2
      ? [0.42, -0.42, 0.82, -0.82, 1.28, -1.28, 1.82, -1.82, 2.35, -2.35]
      : [0.72, -0.72, 1.42, -1.42, 2.1, -2.1];
    for (const arc of arcs) {
      const angle = baseAngle + arc + Math.sin(actor.phase) * (actor.brainTier >= 2 ? 0.08 : 0.18);
      if (tryPos(startX + Math.cos(angle) * stride, startZ + Math.sin(angle) * stride)) return;
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
      actor.bodyMaterial.emissive.setHex(0x000000);
    }
    actor.phase += dt * actor.speed * 4.2;
    actor.root.position.set(actor.position.x, this.options.getTerrainHeight(actor.position.x, actor.position.z), actor.position.z);

    let dx = playerPos.x - actor.position.x;
    let dz = playerPos.z - actor.position.z;
    let dist = Math.hypot(dx, dz);
    const safeZoneForZombie = this.nearestZone(actor.position.x, actor.position.z);
    const insideZone = !!safeZoneForZombie && distToZone(actor.position.x, actor.position.z, safeZoneForZombie) < safeZoneForZombie.radius + 0.3;
    const canBreach = insideZone && safeZoneForZombie?.phase === 'weakening' && actor.type !== 'walker';
    if (insideZone && !canBreach && safeZoneForZombie) {
      const zx = actor.position.x - safeZoneForZombie.x;
      const zz = actor.position.z - safeZoneForZombie.z;
      const length = Math.max(0.001, Math.hypot(zx, zz));
      this.moveZombie(actor, (zx / length) * dt * 2.1, (zz / length) * dt * 2.1);
    } else if (inSafeZone && !canBreach) {
      const length = Math.max(0.001, dist);
      this.moveZombie(actor, (-dx / length) * dt * Math.min(2.4, actor.speed), (-dz / length) * dt * Math.min(2.4, actor.speed));
    } else {
      if (canBreach && this.elapsed - actor.lastZoneDamage >= 0.65) {
        actor.lastZoneDamage = this.elapsed;
        this.damageZombie(actor, 10, false, false, true, 'SANCTUARY PURGED AN INFECTED', false);
        if (actor.dead) return;
      }
      // From wave 7 onward, a subset of infected approach a flank point rather than the player's exact position.
      if (actor.flanker && actor.brainTier >= 2 && dist > 3.2 && !inSafeZone) {
        const approachAngle = Math.atan2(dz, dx) + actor.flankSide * 0.78;
        const flankX = playerPos.x + Math.cos(approachAngle) * 2.7;
        const flankZ = playerPos.z + Math.sin(approachAngle) * 2.7;
        dx = flankX - actor.position.x; dz = flankZ - actor.position.z;
        dist = Math.hypot(dx, dz);
      }
      const length = Math.max(0.001, dist);
      const nightFactor = clamp(this.options.getNightFactor?.() ?? 0, 0, 1);
      const pulseSlow = this.pulseRemaining > 0 && Math.hypot(playerPos.x - actor.position.x, playerPos.z - actor.position.z) <= 7.5 ? (actor.bossTier > 0 || actor.type === 'brute' ? .45 : .65) : 1;
      const effectiveSpeed = actor.speed * (1 + nightFactor * 0.18) * pulseSlow;
      if (actor.bossTier === 2 && dist <= 4.1 && this.elapsed - actor.lastAttack >= actor.attackCooldown && this.hasLineOfSight(actor.position, playerPos)) {
        actor.lastAttack = this.elapsed;
        this.options.notify('BOSS SLAM · DODGE THE SHOCKWAVE');
        this.damagePlayer(Math.round(actor.damage * (1.2 + nightFactor * 0.2)));
        actor.leftArm.rotation.x = -1.9;
        actor.rightArm.rotation.x = -1.9;
      } else if (dist > actor.attackRange * 0.92) {
        const stride = effectiveSpeed * dt;
        this.moveZombie(actor, (dx / length) * stride, (dz / length) * stride);
      } else if (this.hasLineOfSight(actor.position, playerPos)) {
        if (this.elapsed - actor.lastAttack >= actor.attackCooldown) {
          actor.lastAttack = this.elapsed;
          this.damagePlayer(Math.round(actor.damage * (1 + nightFactor * 0.2)));
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
    const origin = this.sightOrigin.copy(from);
    origin.y += 1.05;
    const direction = this.sightDirection.copy(to);
    direction.y += 1.05;
    direction.sub(origin);
    const distance = direction.length();
    if (distance < 0.1) return true;
    direction.multiplyScalar(1 / distance);
    this.raycaster.set(origin, direction);
    this.raycaster.far = Math.max(0, distance - 0.3);
    this.sightIntersections.length = 0;
    const blockers = this.currentSightBlockers ?? (this.currentSightBlockers = this.options.getSightBlockers());
    this.raycaster.intersectObjects(blockers, true, this.sightIntersections);
    return this.sightIntersections.length === 0;
  }

  private damagePlayer(amount: number): void {
    if (this.isDead || this.isPlayerProtected(this.options.getPlayerPosition().x, this.options.getPlayerPosition().z)) return;
    this.activateAudio();
    survivalSound.playZombieAttack();
    survivalSound.playPlayerHurt();
    this.health = Math.max(0, this.health - Math.round(amount * (this.fieldEffects['reinforced-vest'] ? 0.65 : 1)));
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
      const pickupAmount = Math.round(drop.amount * (this.fieldEffects.scavenger ? 1.5 : 1));
      if (drop.kind === 'medkit') {
        if (this.health >= this.maxHealth) continue;
        this.health = Math.min(this.maxHealth, this.health + pickupAmount);
        survivalSound.playPickup();
        this.options.notify(`FIRST AID +${pickupAmount} HP`);
      } else {
        const weaponAmmo = this.ammo[this.weapon];
        weaponAmmo.reserve = Math.min(WEAPONS[this.weapon].reserveStart * 2, weaponAmmo.reserve + pickupAmount);
        survivalSound.playPickup();
        this.options.notify(`AMMUNITION +${pickupAmount}`);
      }
      this.scene.remove(drop.root);
      disposeGroup(drop.root);
      this.loot.splice(i, 1);
      this.emitStatus();
    }
  }

  private spawnImpact(position: THREE.Vector3, blood: boolean): void {
    this.combatEffects.impact(position, blood);
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    this.combatEffects.tracer(from, to);
  }

  private removeZombie(actor: ZombieActor): void {
    const index = this.zombies.indexOf(actor);
    if (index >= 0) this.zombies.splice(index, 1);
    this.scene.remove(actor.root);
    disposeGroup(actor.root);
  }

  private nearestZone(x: number, z: number): RuntimeSafeZone | null {
    let found: RuntimeSafeZone | null = null;
    let distance = Infinity;
    for (const zone of this.zones) {
      if (!zone.active || zone.phase === 'collapsed') continue;
      const d = distToZone(x, z, zone);
      if (d < distance) { distance = d; found = zone; }
    }
    return found;
  }

  private inSafeZone(x: number, z: number): boolean {
    const zone = this.nearestZone(x, z);
    return !!zone && distToZone(x, z, zone) <= zone.radius;
  }

  private isPlayerProtected(x: number, z: number): boolean {
    const zone = this.nearestZone(x, z);
    return !!zone && zone.phase === 'stable' && distToZone(x, z, zone) <= zone.radius;
  }

  private spawnZombie(): void {
    if (this.zombies.filter(z => !z.dead).length >= this.maxZombies) return;
    const player = this.options.getPlayerPosition();
    for (let attempt = 0; attempt < 14; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const nearbyZone = this.nearestZone(player.x, player.z);
      const pressure = (nearbyZone?.phase === 'weakening' ? 5 : 0) + Math.min(4, this.wave * 0.04);
      const radius = Math.max(9, 15 + Math.random() * 10 - pressure);
      const x = player.x + Math.cos(angle) * radius;
      const z = player.z + Math.sin(angle) * radius;
      if (this.inSafeZone(x, z) || this.options.isWater(x, z) && this.options.getWaterDepth(x, z) > 0.55) continue;
      if (!this.options.canOccupy(x, z) || this.options.canSpawnAt?.(x, z) === false) continue;
      const roll = Math.random();
      const nightFactor = clamp(this.options.getNightFactor?.() ?? 0, 0, 1);
      let type: ZombieActor['type'] = this.wave >= 3 && roll > 0.88 - nightFactor * 0.08 ? 'brute' : this.wave >= 2 && roll > 0.60 - nightFactor * 0.08 ? 'runner' : 'walker';
      let bossTier: 0 | 1 | 2 = 0;
      if (!this.bossSpawnedThisWave && this.wave >= 5 && this.wave % 10 === 0) {
        type = 'brute'; bossTier = 2; this.bossSpawnedThisWave = true;
        this.options.notify(`WAVE ${this.wave} · MAJOR BOSS APPROACHING`);
      } else if (!this.bossSpawnedThisWave && this.wave >= 5 && this.wave % 5 === 0) {
        type = 'brute'; bossTier = 1; this.bossSpawnedThisWave = true;
        this.options.notify(`WAVE ${this.wave} · MINI-BOSS APPROACHING`);
      }
      this.zombies.push(this.createZombie(type, x, z, bossTier));
      return;
    }
  }

  private updateZones(dt: number): void {
    if (this.zoneTransitionTimer > 0) {
      this.zoneTransitionTimer = Math.max(0, this.zoneTransitionTimer - dt);
      if (this.zoneTransitionTimer === 0 && this.zones.length > 0) {
        const next = this.zones[this.nextZoneIndex % this.zones.length];
        this.nextZoneIndex = (this.nextZoneIndex + 1) % this.zones.length;
        next.active = true; next.phase = 'stable'; next.age = 0; next.integrity = 100;
        this.options.notify(`SAFE ZONE RELOCATED · ${next.label} · MOVE NOW`);
      }
    }
    for (const zone of this.zones) {
      if (zone.active) {
        zone.age += dt;
        if (zone.phase === 'stable' && zone.age >= 120) {
          zone.phase = 'weakening';
          this.options.notify(`${zone.label} DEFENSES WEAKENING · ELITE INFECTED MAY BREACH`);
        }
        if (zone.phase === 'weakening') {
          zone.integrity = Math.max(0, 100 * (1 - (zone.age - 120) / 45));
          if (zone.age >= 165) {
            zone.phase = 'collapsed'; zone.active = false; zone.integrity = 0;
            this.zoneTransitionTimer = 18;
            this.options.notify(`${zone.label} SAFE ZONE COLLAPSED · RELOCATION INCOMING`);
          }
        }
      }
      zone.root.position.set(zone.x, this.options.getTerrainHeight(zone.x, zone.z), zone.z);
      zone.root.visible = this.enabled && zone.active && zone.phase !== 'collapsed';
      const field = zone.root.getObjectByName('safe-zone-field') as THREE.Mesh | null;
      const ring = zone.root.getObjectByName('safe-zone-boundary') as THREE.Mesh | null;
      const wall = zone.root.getObjectByName('safe-zone-energy-wall') as THREE.Mesh | null;
      const dome = zone.root.getObjectByName('safe-zone-energy-dome') as THREE.Mesh | null;
      const progress = zone.phase === 'weakening' ? 1 - zone.integrity / 100 : 0;
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 2.6 + zone.x * 0.17 + zone.z * 0.11);
      const barrierColor = zone.phase === 'weakening' ? 0xff8c45 : 0x36f89a;
      if (field?.material instanceof THREE.MeshBasicMaterial) {
        field.material.color.setHex(zone.phase === 'weakening' ? 0xffa047 : 0x20c878);
        field.material.opacity = (zone.phase === 'weakening' ? 0.055 + progress * 0.07 : 0.035) + pulse * 0.025;
      }
      if (ring?.material instanceof THREE.MeshStandardMaterial) {
        ring.material.color.setHex(zone.phase === 'weakening' ? 0xff6933 : 0x41f59a);
        ring.material.emissive.setHex(zone.phase === 'weakening' ? 0x9c2410 : 0x087a43);
        ring.material.emissiveIntensity = 0.9 + pulse * 1.3;
        ring.scale.setScalar(1 + pulse * 0.004);
      }
      if (wall?.material instanceof THREE.MeshBasicMaterial) {
        wall.material.color.setHex(barrierColor);
        wall.material.opacity = (zone.phase === 'weakening' ? 0.055 + progress * 0.055 : 0.055) + pulse * 0.045;
      }
      if (dome?.material instanceof THREE.MeshBasicMaterial) {
        dome.material.color.setHex(barrierColor);
        dome.material.opacity = 0.018 + pulse * (zone.phase === 'weakening' ? 0.055 : 0.027);
        dome.scale.y = 0.52 + pulse * 0.08;
      }
      for (let i = 0; i < 3; i++) {
        const band = zone.root.getObjectByName(`safe-zone-wave-${i}`) as THREE.Mesh | null;
        if (!band) continue;
        band.position.y = 0.35 + ((this.elapsed * 0.72 + i * 1.78) % 5.15);
        if (band.material instanceof THREE.MeshBasicMaterial) {
          band.material.color.setHex(barrierColor);
          band.material.opacity = 0.42 + pulse * 0.48;
        }
      }
      for (let i = 0; i < 12; i++) {
        const node = zone.root.getObjectByName(`safe-zone-node-${i}`) as THREE.Mesh | null;
        if (!node) continue;
        const angle = (node.userData.barrierPhase as number) + this.elapsed * (zone.phase === 'weakening' ? 0.56 : 0.27);
        node.position.set(Math.cos(angle) * (zone.radius - 0.12), 0.45 + (i % 4) * 1.28 + Math.sin(this.elapsed * 2.4 + i) * 0.18, Math.sin(angle) * (zone.radius - 0.12));
        if (node.material instanceof THREE.MeshBasicMaterial) node.material.color.setHex(zone.phase === 'weakening' ? 0xffc095 : 0xc0ffda);
      }
    }
  }

  private tutorialMode = false;
  setTutorialMode(active: boolean): void { this.tutorialMode = active; }

  update(dt: number, firing = false, aiming = false): void {
    if (!this.enabled || this.runComplete) return;
    // The player position/blocker set is stable during this update, so all infected
    // can share the same filtered sight-blocker array until the next simulation tick.
    this.currentSightBlockers = null;
    this.elapsed += dt;
    for (const id of Object.keys(this.fieldEffects) as Array<keyof typeof this.fieldEffects>) this.fieldEffects[id] = Math.max(0, (this.fieldEffects[id] || 0) - dt);
    const travelPosition = this.options.getPlayerPosition();
    if (!this.tutorialMode && this.previousTravelPosition && !this.options.isWater(travelPosition.x, travelPosition.z) && !this.options.isWater(this.previousTravelPosition.x, this.previousTravelPosition.z)) {
      const distance = Math.hypot(travelPosition.x - this.previousTravelPosition.x, travelPosition.z - this.previousTravelPosition.z);
      // Ignore teleports/restarts and discontinuities rather than awarding travel.
      if (distance <= Math.max(1, dt * 16)) this.distanceMeters += distance;
    }
    if (!this.previousTravelPosition) this.previousTravelPosition = new THREE.Vector3();
    this.previousTravelPosition.copy(travelPosition);
    if (!this.tutorialMode && this.preparationTimer > 0) {
      this.preparationTimer = Math.max(0, this.preparationTimer - dt);
      if (this.preparationTimer === 0 && !this.hasEnteredHostileArea) {
        this.wave = 1;
        this.waveQueue = 4;
        this.spawnTimer = 0;
        this.waveIntroTimer = 1.6;
        this.emitStatus();
        this.hasEnteredHostileArea = true;
        this.options.notify('PREPARATION COMPLETE · WAVE 1 READY');
      }
    }
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    this.statusTimer += dt;
    this.setAim(aiming, dt);

    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0) this.finishReload();
    }
    const definition = WEAPONS[this.weapon];
    if ((firing || this.fireHeld) && this.ammo[this.weapon].mag <= 0 && this.ammo[this.weapon].reserve > 0 && this.reloadTimer <= 0) this.reload();
    if ((firing || this.fireHeld) && definition.automatic && this.fireCooldown <= 0) this.fire();

    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
    for (const [id, rig] of this.weaponRigs) {
      const active = this.enabled && id === this.weapon && (this.options.isFirstPerson?.() ?? true);
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
      const weaponBase = this.weaponBaseScratch.copy(base);
      const movement = Math.min(1, (this.options.getMovementSpeed?.() ?? 0) / 5);
      const reloadProgress = this.reloadTimer > 0 ? 1 - this.reloadTimer / WEAPONS[this.weapon].reloadTime : 0;
      const reloadDip = this.reloadTimer > 0 ? Math.sin(reloadProgress * Math.PI) : 0;
      weaponBase.x += Math.sin(this.elapsed * 7) * movement * (this.aimActive ? 0.001 : 0.005);
      weaponBase.y += Math.sin(this.elapsed * 14) * movement * (this.aimActive ? 0.001 : 0.006) - reloadDip * 0.08;
      weaponBase.z += Math.cos(this.elapsed * 8) * (this.aimActive ? 0.002 : 0.005);
      weaponBase.z += Math.max(0, activeRig.root.position.z - base.z) * Math.exp(-dt * WEAPONS[this.weapon].recoilRecovery);
      activeRig.root.position.lerp(weaponBase, 1 - Math.exp(-dt * 12));
      const targetRotation = this.aimActive ? activeRig.adsRot : activeRig.baseRot;
      const blend = 1 - Math.exp(-dt * 10);
      activeRig.root.rotation.x += (targetRotation.x - reloadDip * 0.3 - activeRig.root.rotation.x) * blend;
      activeRig.root.rotation.y += (targetRotation.y - activeRig.root.rotation.y) * blend;
      activeRig.root.rotation.z += (targetRotation.z + reloadDip * 0.16 - activeRig.root.rotation.z) * blend;
      if (activeRig.slideOrPump) {
        const baseZ = this.slideBaseZ.get(this.weapon) ?? activeRig.slideOrPump.position.z;
        const reloadDuration = this.activeReloadDuration;
        const reloadProgress = this.reloadTimer > 0 ? 1 - this.reloadTimer / reloadDuration : 1;
        const travel = this.weapon === 'shotgun' ? 0.11 : 0.035;
        const reloadOffset = this.reloadTimer > 0 ? Math.sin(reloadProgress * Math.PI) * travel : 0;
        activeRig.slideOrPump.position.z = baseZ + reloadOffset;
      }
    }
    this.updateZones(dt);

    const playerPos = this.options.getPlayerPosition();
    const nearSafe = this.isPlayerProtected(playerPos.x, playerPos.z);
    if (!this.tutorialMode && !nearSafe && !this.hasEnteredHostileArea) {
      this.hasEnteredHostileArea = true;
      this.wave = 1;
      this.waveQueue = 4;
      this.spawnTimer = 0;
      this.waveIntroTimer = 1.6;
      this.emitStatus();
      this.options.notify('HOSTILE TERRITORY · FIND COVER');
    }

    // Publish the cleared announcement before any spawn, even after a long frame.
    const wasIntroducingWave = this.waveIntroTimer > 0;
    if (wasIntroducingWave) {
      this.waveIntroTimer = Math.max(0, this.waveIntroTimer - dt);
      if (this.waveIntroTimer === 0) this.emitStatus();
    }
    if (!this.tutorialMode && !this.isDead && this.hasEnteredHostileArea && !nearSafe && !wasIntroducingWave) {
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
          if (this.wave >= 100) {
            this.runComplete = true;
            this.pulseRemaining = this.medicRemaining = 0;
            if (this.cardFields) this.cardFields.children.forEach(ring => ring.visible = false);
            this.options.notify('100 WAVES SURVIVED · ISLAND SECURED');
            this.emitStatus();
            return;
          }
          this.wave++;
          this.spawnTimer = 0;
          this.waveIntroTimer = 1.6;
          this.emitStatus();
          this.bossSpawnedThisWave = false;
          this.waveQueue = Math.min(3 + this.wave, this.maxZombies);
          this.options.notify(`WAVE ${this.wave} · CONTACT`);
        }
      }
    } else if (nearSafe) {
      this.spawnTimer = Math.max(0, this.spawnTimer - dt * 0.5);
    }

    const aiStarted = this.options.performanceActive?.() ? performance.now() : null;
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const actor = this.zombies[i];
      this.updateZombie(actor, dt, playerPos, nearSafe);
      if (actor.dead && actor.deathAge > 6) this.removeZombie(actor);
    }
    if (aiStarted !== null) this.options.onPerformanceCost?.('enemyAI', performance.now() - aiStarted);
    this.updateCardFields(dt);
    if (!this.isDead) this.updateLoot(dt, playerPos);
    const effectsStarted = this.options.performanceActive?.() ? performance.now() : null;
    this.combatEffects.update(dt);
    if (effectsStarted !== null) this.options.onPerformanceCost?.('combatEffects', performance.now() - effectsStarted);
    if (this.flashDamageTimer > 0) this.flashDamageTimer = Math.max(0, this.flashDamageTimer - dt);

    if (this.statusTimer >= 0.12) {
      this.statusTimer = 0;
      this.emitStatus();
    }
  }

  restart(): void {
    this.combatEffects.clear();
    for (const actor of [...this.zombies]) this.removeZombie(actor);
    for (const drop of this.loot) {
      this.scene.remove(drop.root);
      disposeGroup(drop.root);
    }
    this.loot.length = 0;
    this.health = this.maxHealth;
    this.kills = 0;
    this.bossKills = 0;
    this.distanceMeters = 0;
    this.elapsed = 0;
    this.previousTravelPosition = null;
    this.fieldEffects = {};
    this.wave = 0;
    this.preparationTimer = 0;
    this.skillCooldown = 0;
    this.pulseRemaining = this.pulseBeat = this.medicRemaining = this.medicBeat = this.medicCooldown = 0;
    if (this.cardFields) this.cardFields.children.forEach(ring => ring.visible = false);
    this.runComplete = false;
    this.bossSpawnedThisWave = false;
    this.zoneTransitionTimer = 0;
    this.nextZoneIndex = 1;
    this.zones.forEach((zone, index) => { zone.active = index === 0; zone.phase = 'stable'; zone.age = 0; zone.integrity = 100; });
    this.isDead = false;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.hasEnteredHostileArea = false;
    this.waveQueue = 0;
    this.spawnTimer = 0;
    this.breakTimer = 0;
    this.waveIntroTimer = 0;
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

  getPerformanceDiagnostics(): {
    zombieCount: number;
    livingZombies: number;
    lootDrops: number;
    tracerLines: number;
    hitSparks: number;
    activeSafeZones: number;
  } {
    let livingZombies = 0;
    for (const actor of this.zombies) if (!actor.dead) livingZombies++;
    let activeSafeZones = 0;
    for (const zone of this.zones) if (zone.active && zone.phase !== 'collapsed') activeSafeZones++;
    return {
      zombieCount: this.zombies.length,
      livingZombies,
      lootDrops: this.loot.length,
      tracerLines: this.combatEffects.tracerCount,
      hitSparks: this.combatEffects.impactCount,
      activeSafeZones,
    };
  }

  getRadarState(): SurvivalRadarState {
    return {
      safeZones: (() => {
        const active = this.zones.filter(zone => zone.active && zone.phase !== 'collapsed');
        if (active.length || this.zoneTransitionTimer <= 0 || !this.zones.length) return active.map(({ id, label, x, z, radius }) => ({ id, label, x, z, radius }));
        const next = this.zones[this.nextZoneIndex % this.zones.length];
        return [{ id: next.id, label: `NEXT · ${next.label}`, x: next.x, z: next.z, radius: next.radius }];
      })(),
      zombies: this.zombies
        .filter(actor => !actor.dead)
        .map(actor => ({ x: actor.position.x, z: actor.position.z, type: actor.type })),
    };
  }

  private status(): SurvivalStatus {
    const p = this.options.getPlayerPosition();
    const nearest = this.nearestZone(p.x, p.z);
    const guideZone = nearest ?? (this.zoneTransitionTimer > 0 && this.zones.length ? this.zones[this.nextZoneIndex % this.zones.length] : null);
    const ammo = this.ammo[this.weapon];
    const living = this.zombies.filter(z => !z.dead).length;
    return {
      enabled: this.enabled, health: this.health, maxHealth: this.maxHealth,
      weapon: this.weapon, weaponLabel: WEAPONS[this.weapon].label,
      ammoInMag: ammo.mag, ammoReserve: ammo.reserve, kills: this.kills, wave: this.wave,
      waveIntroActive: this.waveIntroTimer > 0,
      livingZombies: living, inSafeZone: this.isPlayerProtected(p.x, p.z), runComplete: this.runComplete,
      preparationSeconds: Math.ceil(this.preparationTimer),
      durationSeconds: Math.max(0, Math.floor(this.elapsed)),
      bossKills: this.bossKills, distanceMeters: this.distanceMeters,
      skillCooldownSeconds: Math.ceil(this.skillCooldown),
      pulseActiveSeconds: Math.ceil(this.pulseRemaining), medicActiveSeconds: Math.ceil(this.medicRemaining),
      nearestZone: guideZone?.label ?? 'SAFE ZONE',
      zoneDistance: guideZone ? Math.max(0, distToZone(p.x, p.z, guideZone) - guideZone.radius) : 0,
      reloading: this.reloadTimer > 0, dead: this.isDead,
      zonePhase: nearest?.phase, zoneIntegrity: nearest?.integrity,
      safeZoneX: guideZone?.x, safeZoneZ: guideZone?.z,
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
    this.combatEffects.dispose();
    if (this.cardFields) { this.scene.remove(this.cardFields); disposeGroup(this.cardFields); this.cardFields = null; }
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
