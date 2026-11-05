/** Shared network types for multiplayer FPS / arena mode. */

export type PlayerId = string;

export interface PlayerPresence {
  id: PlayerId;
  name: string;
  team?: number;
  ready?: boolean;
  joinedAt: number;
}

export interface PlayerState {
  id: PlayerId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  vx?: number;
  vz?: number;
  health: number;
  weapon: number; // 0 pistol, 1 shotgun, 2 rifle
  anim: string;   // idle | walk | run | jump | attack | hit | death
  aiming?: boolean;
  t: number;      // sender timestamp (ms)
}

export interface ShootEvent {
  type: 'shoot';
  id: PlayerId;
  origin: [number, number, number];
  direction: [number, number, number];
  weapon: number;
  t: number;
}

export interface HitEvent {
  type: 'hit';
  attacker: PlayerId;
  target: PlayerId;
  damage: number;
  headshot?: boolean;
  t: number;
}

export interface DeathEvent {
  type: 'death';
  killer: PlayerId;
  victim: PlayerId;
  t: number;
}

export interface MatchEvent {
  type: 'match';
  action: 'start' | 'end' | 'score';
  scores?: Record<PlayerId, number>;
  t: number;
}

export type NetEvent = ShootEvent | HitEvent | DeathEvent | MatchEvent;

export interface RoomInfo {
  code: string;
  channel: string;
  hostId?: PlayerId;
  maxPlayers: number;
}
