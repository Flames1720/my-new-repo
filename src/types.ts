import * as THREE from 'three';

export type Mode = 'tpp' | 'fpp';

export type Biome = 'meadow' | 'forest' | 'wetland' | 'alpine' | 'shore' | 'riverbank';
export type Species = 'deer' | 'rabbit' | 'fox' | 'wolf' | 'boar' | 'duck' | 'cow';
export type Gender = 'male' | 'female';
export type Mood =
  | 'resting'
  | 'foraging'
  | 'wandering'
  | 'alert'
  | 'fleeing'
  | 'curious'
  | 'drinking'
  | 'sleeping'
  | 'hunting'
  | 'defending'
  | 'mating'
  | 'seeking_mate'
  | 'flying';

export type EmoteKind = 'none' | 'wave' | 'cheer' | 'sit' | 'dance' | 'inspect';

export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'storm';

export type HomeLevel = 1 | 2 | 3;

export type PlayerRole = 'explorer' | 'naturalist' | 'builder' | 'ranger';

export type CharacterModelId =
  | 'quaternius-adventurer'
  | 'quaternius-animated-human'
  | 'quaternius-animated-woman'
  | 'kenney-adventurer'
  | 'mixamo-walker'
  | 'legacy-rigged';

export interface PlayerProfile {
  name: string;
  gender: 'male' | 'female';
  role: PlayerRole;
  coins: number;
  level: number;
  skillSurvival: number;
  skillHusbandry: number;
  skillBuilding: number;
  skillCartography: number;
}

export interface SettingsState {
  sensitivityX: number; // Degrees turned across a full look-zone-width swipe; default 180
  sensitivityY: number; // Degrees looked across a full look-zone-height swipe; default 100
  adsSensitivity: number; // Multiplier applied only while holding aim; 0.25 to 1
  invertY: boolean;
  lookWhileAiming: boolean; // Allow dragging ADS button to turn, off by default
  lookWhileFiring: boolean;
  audioMaster: number; // Master volume 0-1
  audioSfx: number; // Sound effects volume 0-1 // Allow dragging Shoot button to turn, off by default
  cameraAcceleration: 'fixed' | 'distance' | 'speed';
  cameraAccelerationStrength: number; // 0 to 2.0
  cameraAccelerationThreshold: number; // 0.5 to 2.0; higher requires a stronger/faster swipe
  graphics: 'low' | 'med' | 'high';
  weatherMode: 'dynamic' | 'clear' | 'rain';
  chunkRadius: number;
  characterGender?: 'male' | 'female';
  characterOutfit?: 'explorer' | 'ranger' | 'scout' | 'arctic' | 'lagos';
  characterModel?: CharacterModelId;
  lodDetail?: 'ultra' | 'balanced' | 'fast';
}

export interface BreadcrumbPoint {
  x: number;
  z: number;
  time: number;
}

export interface Waypoint {
  x: number;
  z: number;
  label: string;
}

export type ResourceKind = 'oak' | 'pine' | 'fruit' | 'palm' | 'ancient_oak' | 'rock' | 'boulder';

export interface ResourceDef {
  family: 'tree' | 'rock';
  hitsToFell: number;
  regrowSeconds: number;
  colliderRadius: number;
  yieldItem: string;
  yieldQty: [number, number];
  bonusItem?: string;
  bonusQty?: [number, number];
  trunkColor?: number;
  crownColor?: number;
  fruitColor?: number;
  rockColor?: number;
}

export interface AnimalMarker {
  x: number;
  z: number;
  species: Species;
  gender?: Gender;
  isBaby?: boolean;
  hp?: number;
  isFlying?: boolean;
}

export interface BuiltAnimal {
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Group[];
  head: THREE.Group;
  tail: THREE.Group;
  wings?: THREE.Object3D[];
}

export interface AnimalState {
  id: string;
  species: Species;
  gender: Gender;
  biome: Biome;
  chunkKey: string;
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Group[];
  head: THREE.Group;
  tail: THREE.Group;
  wings?: THREE.Object3D[];
  home: THREE.Vector2;
  target: THREE.Vector2;
  think: number;
  fleeCooldown: number;
  mood: Mood;
  phase: number;
  direction: number;
  trust: number;
  isBaby: boolean;
  scale: number;
  hp: number;
  maxHp: number;
  burnUntil?: number;
  burnTick?: number;
  hunger: number;
  thirst?: number;
  matingCooldown: number;
  age: number;
  motherId?: string;
  packId?: string;
  isFlying?: boolean;
  flyAltitude?: number;
  targetPreyId?: string;
  huntStamina?: number;
  isAttachedToScene: boolean;
}
