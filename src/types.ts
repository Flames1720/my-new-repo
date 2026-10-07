import * as THREE from 'three';

export type Mode = 'tpp' | 'fpp';

export type Biome = 'meadow' | 'forest' | 'wetland' | 'alpine' | 'shore' | 'riverbank';
export type Species = 'deer' | 'rabbit' | 'fox' | 'wolf' | 'boar' | 'duck';
export type Mood = 'resting' | 'foraging' | 'wandering' | 'alert' | 'fleeing' | 'curious' | 'drinking' | 'sleeping';

export type EmoteKind = 'none' | 'wave' | 'cheer' | 'sit' | 'dance' | 'inspect';

export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'storm';

export type HomeLevel = 1 | 2 | 3;

export interface SettingsState {
  sensitivityX: number; // 0.2 to 3.0, default 1.0
  sensitivityY: number; // 0.2 to 3.0, default 1.0
  invertY: boolean;
  graphics: 'low' | 'med' | 'high';
  weatherMode: 'dynamic' | 'clear' | 'rain';
  chunkRadius: number;
  characterOutfit?: 'explorer' | 'ranger' | 'scout' | 'arctic';
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
  isBaby?: boolean;
}

export interface AnimalState {
  id: string;
  species: Species;
  biome: Biome;
  chunkKey: string;
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Group[];
  head: THREE.Group;
  tail: THREE.Group;
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
}
