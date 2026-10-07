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
  sensitivityX: number; // 0.2 to 3.0, default 1.0
  sensitivityY: number; // 0.2 to 3.0, default 1.0
  invertY: boolean;
  graphics: 'low' | 'med' | 'high';
  weatherMode: 'dynamic' | 'clear' | 'rain';
  chunkRadius: number;
  characterGender?: 'male' | 'female';
  characterOutfit?: 'explorer' | 'ranger' | 'scout' | 'arctic' | 'lagos';
  characterCustomization?: {
    skinTone: number;
    hairColor: number;
    eyeColor: number;
    shirtColor: number;
    pantsColor: number;
    shoeColor: number;
    beard: boolean;
  };
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
  hunger: number;
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
