import * as THREE from 'three';
import './style.css';
import type { Mode, EmoteKind, HomeLevel, ResourceKind, ResourceDef, PlayerProfile, Species } from './types';
import {
  SEED,
  SIZE,
  WORLD_RADIUS,
  WORLD_DIAMETER,
  WATER_LEVEL,
  ROAD_SPACING,
  ROAD_WIDTH,
  HOME_X,
  HOME_Z,
  HOME_BASE_HEIGHT,
  VILLAGE_X,
  VILLAGE_Z,
  terrainHeightAt,
  waterDepthAt,
  waterAt,
  biomeAt,
  terrainColorAt,
  mountainMaskAt,
  roadAt,
  isRiverAt,
  isBridgeAt,
  nearHome,
  nearVillage,
  hash,
  clamp,
  lerp,
} from './terrain';
import { PlayerCharacter } from './character';
import { WeatherSystem } from './weather';
import { buildHome, buildVillage, buildBridge, HOME_UPGRADE_COSTS } from './settlement';
import { WildlifeSystem, isSharedAnimalAsset, speciesColor, SPECIES_NAME, SPECIES_ICON } from './fauna';
import { MinimapSystem } from './minimap';
import { settings } from './settings';

type Save = {
  version: 2;
  player: { x: number; y: number; z: number; ry: number; mode: Mode };
  camera: { yaw: number; pitch: number; distance: number };
  changes: Record<string, string[]>;
  inventory: Record<string, number>;
  wildlifeTrust?: Record<string, number>;
  worldTime?: number;
  homeLevel?: HomeLevel;
};

const IS_TOUCH_DEVICE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const LOW_POWER_MODE = IS_TOUCH_DEVICE || (navigator.hardwareConcurrency || 4) <= 4;
const SAVE_KEY = 'virtual-family-core-v2';

const angleLerp = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, t);

// --- RESOURCE DEFINITIONS ---
const RESOURCE_DEFS: Record<ResourceKind, ResourceDef> = {
  oak: { family: 'tree', hitsToFell: 3, regrowSeconds: 180, colliderRadius: 0.72, yieldItem: 'Wood', yieldQty: [2, 4], trunkColor: 0x694b35, crownColor: 0x3d7148 },
  ancient_oak: { family: 'tree', hitsToFell: 6, regrowSeconds: 320, colliderRadius: 1.45, yieldItem: 'Wood', yieldQty: [6, 12], bonusItem: 'Fruit', bonusQty: [2, 5], trunkColor: 0x513824, crownColor: 0x2e5c38 },
  pine: { family: 'tree', hitsToFell: 2, regrowSeconds: 140, colliderRadius: 0.6, yieldItem: 'Pine Wood', yieldQty: [1, 3], trunkColor: 0x5b4330, crownColor: 0x2e5c3e },
  fruit: { family: 'tree', hitsToFell: 4, regrowSeconds: 220, colliderRadius: 0.72, yieldItem: 'Wood', yieldQty: [1, 3], bonusItem: 'Fruit', bonusQty: [2, 5], trunkColor: 0x6b4a32, crownColor: 0x4a7a3f, fruitColor: 0xcc4433 },
  palm: { family: 'tree', hitsToFell: 3, regrowSeconds: 200, colliderRadius: 0.55, yieldItem: 'Palm Wood', yieldQty: [1, 2], trunkColor: 0x8a6a3f, crownColor: 0x4f8a3d },
  rock: { family: 'rock', hitsToFell: 3, regrowSeconds: Infinity, colliderRadius: 0.55, yieldItem: 'Stone', yieldQty: [2, 4], rockColor: 0x8c8f93 },
  boulder: { family: 'rock', hitsToFell: 6, regrowSeconds: Infinity, colliderRadius: 0.95, yieldItem: 'Stone', yieldQty: [5, 9], bonusItem: 'Ore', bonusQty: [1, 2], rockColor: 0x6f7378 },
};

const ITEM_ICONS: Record<string, string> = {
  Wood: '🪵',
  'Pine Wood': '🪵',
  'Palm Wood': '🪵',
  Fruit: '🍎',
  Stone: '🪨',
  Ore: '⛏️',
};

function pickTreeKind(cx: number, cz: number, i: number, tx: number, tz: number): ResourceKind {
  const nearShore = waterAt(tx + 3.5, tz) || waterAt(tx - 3.5, tz) || waterAt(tx, tz + 3.5) || waterAt(tx, tz - 3.5);
  if (nearShore) return 'palm';

  const roll = hash(cx * 53 + i * 11, cz * 59 - i * 13);
  const pineChunk = hash(cx * 31 + 7, cz * 37 - 7) < 0.35;

  if (pineChunk) return roll < 0.82 ? 'pine' : roll < 0.92 ? 'fruit' : 'ancient_oak';
  if (roll < 0.08) return 'ancient_oak';
  if (roll < 0.22) return 'fruit';
  if (roll < 0.38) return 'pine';
  return 'oak';
}

// PLACEHOLDER_REST_OF_FILE - will complete in follow-up if truncated
