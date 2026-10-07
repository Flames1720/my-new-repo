import * as THREE from 'three';

export type Biome = 'meadow' | 'forest' | 'wetland' | 'alpine' | 'shore';
export type Species = 'deer' | 'rabbit' | 'fox' | 'wolf' | 'boar' | 'duck';
type Mood = 'resting' | 'foraging' | 'wandering' | 'alert' | 'fleeing' | 'curious';

type AnimalState = {
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
};

export interface WildlifeOptions {
  heightAt: (x: number, z: number) => number;
  waterAt: (x: number, z: number) => boolean;
  roadAt: (x: number, z: number) => boolean;
  nearHome: (x: number, z: number) => boolean;
  biomeAt: (x: number, z: number) => Biome;
  chunkSize: number;
  trust: Record<string, number>;
  hasFruit: () => boolean;
  consumeFruit: () => void;
  onTrustChange: () => void;
  notify: (message: string) => void;
}

export interface AnimalMarker { x: number; z: number; species: Species; }

export const SPECIES_NAME: Record<Species, string> = {
  deer: 'White-tailed deer', rabbit: 'Cottontail rabbit', fox: 'Red fox',
  wolf: 'Grey wolf', boar: 'Wild boar', duck: 'Mallard duck',
};
const SPECIES_COLOR: Record<Species, number> = {
  deer: 0xc18e5d, rabbit: 0xbba995, fox: 0xc96834,
  wolf: 0x737a83, boar: 0x59473e, duck: 0x54714c,
};
const SPECIES_ICON: Record<Species, string> = {
  deer: '♧', rabbit: '·', fox: '◆', wolf: '▲', boar: '●', duck: '≈',
};
const AQUATIC = new Set<Species>(['duck']);
const FLEEING = new Set<Species>(['deer', 'rabbit', 'fox', 'wolf', 'boar', 'duck']);
const MAT = new Map<number, THREE.MeshStandardMaterial>();
const GEO = {
  body: new THREE.SphereGeometry(1, 10, 7),
  head: new THREE.SphereGeometry(1, 9, 7),
  leg: new THREE.CapsuleGeometry(.09, .36, 3, 5),
  ear: new THREE.ConeGeometry(.11, .42, 5),
  horn: new THREE.CylinderGeometry(.025, .07, .48, 5),
  muzzle: new THREE.SphereGeometry(1, 8, 6),
  tail: new THREE.ConeGeometry(.16, .65, 6),
};
const SHARED_ANIMAL_ASSETS = new Set<THREE.BufferGeometry | THREE.Material>(Object.values(GEO));
const mat = (color: number, roughness = .92) => {
  let m = MAT.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness, flatShading: true }); MAT.set(color, m); SHARED_ANIMAL_ASSETS.add(m); }
  return m;
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function seeded(a: number, b: number): number {
  let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ 847231;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D,
  position: [number, number, number], scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position); m.scale.set(...scale); parent.add(m); return m;
}

function buildAnimal(species: Species): { root: THREE.Group; body: THREE.Group; legs: THREE.Group[]; head: THREE.Group; tail: THREE.Group } {
  const root = new THREE.Group(); root.name = `animal-${species}`;
  const fur = mat(SPECIES_COLOR[species]);
  const pale = mat(species === 'fox' ? 0xf2e8d7 : species === 'wolf' ? 0xaeb5b8 : 0xe8ddc8);
  const dark = mat(species === 'duck' ? 0x263d32 : 0x392f2a);
  const black = mat(0x171817, .45);
  const hoof = mat(species === 'duck' ? 0xd88935 : 0x42352c);
  const body = new THREE.Group(); body.name = 'body'; root.add(body);
  const size = species === 'rabbit' || species === 'duck' ? .67 : species === 'boar' ? 1.12 : species === 'wolf' ? 1.02 : .94;
  mesh(GEO.body, fur, body, [0, .72 * size, 0], [1.05 * size, .55 * size, .72 * size]);
  if (species === 'deer') {
    const neck = mesh(GEO.body, fur, body, [0, 1.05, .43], [.27, .52, .27]); neck.rotation.x = -.35;
  }
  if (species === 'boar') mesh(GEO.body, pale, body, [0, .52, .49], [.38, .28, .28]);
  if (species === 'duck') {
    mesh(GEO.body, mat(0x3c5e42), body, [0, .76, 0], [.35, .28, .42]);
    mesh(GEO.body, pale, body, [0, .72, .32], [.22, .2, .2]);
  }

  const head = new THREE.Group(); head.name = 'head-pivot';
  head.position.set(0, species === 'rabbit' ? .98 : 1.02, species === 'deer' ? .61 : .52); body.add(head);
  mesh(GEO.head, species === 'duck' ? mat(0x2e513b) : fur, head, [0, 0, .1],
    species === 'boar' ? [.32, .28, .38] : species === 'deer' ? [.24, .29, .32] : species === 'duck' ? [.24, .23, .29] : [.26, .24, .29]);
  if (species === 'fox' || species === 'wolf' || species === 'boar' || species === 'duck') {
    const snoutMat = species === 'duck' ? mat(0xe0a43b) : species === 'boar' ? mat(0x826557) : pale;
    mesh(GEO.muzzle, snoutMat, head, [0, -.05, .34], species === 'duck' ? [.2, .1, .3] : species === 'boar' ? [.2, .13, .27] : [.14, .13, .27]);
  }
  if (species === 'deer') {
    for (const side of [-1, 1]) {
      const antler = new THREE.Group(); antler.position.set(side * .13, .25, .02); head.add(antler);
      const stem = mesh(GEO.horn, pale, antler, [side * .03, .19, 0]); stem.rotation.z = -side * .2;
      for (const branch of [-1, 1]) {
        const tine = mesh(GEO.horn, pale, antler, [side * (branch > 0 ? .15 : -.02), .34, .02], [.7, .55, .7]);
        tine.rotation.z = -side * (branch > 0 ? .8 : -.6);
      }
    }
  }
  if (species === 'rabbit' || species === 'fox' || species === 'wolf') {
    const earMat = species === 'rabbit' ? pale : fur;
    for (const side of [-1, 1]) {
      const ear = mesh(GEO.ear, earMat, head, [side * .14, species === 'rabbit' ? .36 : .19, .02],
        species === 'rabbit' ? [.72, 1.35, .55] : [1, 1, .8]);
      ear.rotation.z = -side * (species === 'rabbit' ? .12 : .38);
    }
  }
  for (const side of [-1, 1]) {
    mesh(GEO.head, black, head, [side * .105, .07, .31], [.042, .042, .032]);
    if (species === 'boar') {
      const tusk = mesh(GEO.ear, pale, head, [side * .16, -.12, .25], [.42, .65, .42]); tusk.rotation.x = Math.PI;
    }
  }

  const tail = new THREE.Group(); tail.name = 'tail-pivot'; tail.position.set(0, .8 * size, -.62 * size); body.add(tail);
  const tailMesh = mesh(GEO.tail, species === 'fox' ? pale : fur, tail, [0, .03, -.24],
    species === 'fox' ? [1.2, 1.7, 1.2] : species === 'duck' ? [.6, .65, .7] : [.65, .65, .65]);
  tailMesh.rotation.x = -Math.PI / 2;
  if (species === 'rabbit') mesh(GEO.head, pale, body, [0, .88, -.61], [.14, .14, .14]);

  const legs: THREE.Group[] = [];
  for (const x of [-.28, .28]) for (const z of [-.38, .34]) {
    const pivot = new THREE.Group(); pivot.position.set(x * size, .58 * size, z * size); body.add(pivot);
    const legMat = species === 'duck' ? hoof : (z > 0 ? fur : dark);
    const leg = mesh(GEO.leg, legMat, pivot, [0, -.22 * size, 0], [.74 * size, species === 'boar' ? .75 : size, .74 * size]);
    leg.position.y = -.25 * size;
    mesh(GEO.muzzle, hoof, pivot, [0, -.47 * size, .04], species === 'duck' ? [.22, .08, .3] : [.17, .09, .24]);
    legs.push(pivot);
  }
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, body, legs, head, tail };
}

export function isSharedAnimalAsset(resource: THREE.BufferGeometry | THREE.Material): boolean {
  return SHARED_ANIMAL_ASSETS.has(resource);
}

export class WildlifeSystem {
  readonly animals = new Map<string, AnimalState>();
  readonly trust: Record<string, number>;
  private readonly options: WildlifeOptions;
  private readonly size: number;
  private elapsed = 0;

  constructor(options: WildlifeOptions) { this.options = options; this.trust = options.trust; this.size = options.chunkSize; }

  spawnChunk(cx: number, cz: number, lod: number, parent: THREE.Group): void {
    if (lod >= 2) return;
    const count = lod === 0 ? 2 : 1;
    const size = this.size;
    const minX = cx * size + 1.6, maxX = (cx + 1) * size - 1.6;
    const minZ = cz * size + 1.6, maxZ = (cz + 1) * size - 1.6;
    for (let slot = 0; slot < count; slot++) {
      if (seeded(cx * 29 + slot * 7, cz * 37 - slot * 11) < (lod === 0 ? .62 : .82)) continue;
      const id = `${cx},${cz}:${slot}`;
      let x = 0, z = 0, kind: Species | null = null, habitat: Biome = 'meadow';
      for (let attempt = 0; attempt < 18; attempt++) {
        const r1 = seeded(cx * 101 + slot * 17 + attempt * 31, cz * 73 - slot * 23 + attempt * 7);
        const r2 = seeded(cx * 89 - slot * 13 + attempt * 19, cz * 107 + slot * 29 - attempt * 5);
        x = mix(minX, maxX, r1); z = mix(minZ, maxZ, r2);
        if (this.options.nearHome(x, z) || this.options.roadAt(x, z)) continue;
        habitat = this.options.biomeAt(x, z);
        kind = this.chooseSpecies(habitat, seeded(cx * 131 + slot * 47, cz * 149 - slot * 53));
        if (AQUATIC.has(kind) ? this.options.waterAt(x, z) : !this.options.waterAt(x, z)) break;
        kind = null;
      }
      if (!kind) continue;
      const rootData = buildAnimal(kind);
      rootData.root.name = `wildlife-${id}`;
      rootData.root.userData.animal = { id, species: kind };
      rootData.root.userData.interactable = { action: 'animal', label: SPECIES_NAME[kind] };
      rootData.root.userData.colliderRadius = kind === 'duck' ? .28 : kind === 'rabbit' ? .34 : .48;
      rootData.root.position.set(x, AQUATIC.has(kind) ? 1.27 : this.options.heightAt(x, z), z);
      rootData.root.rotation.y = seeded(cx * 53 + slot, cz * 61 - slot) * Math.PI * 2;
      if (lod > 0) rootData.root.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = false; });
      parent.add(rootData.root);
      const initialTrust = clamp(this.trust[id] || 0, 0, 5);
      this.animals.set(id, {
        id, species: kind, biome: habitat, chunkKey: `${cx},${cz}`, root: rootData.root,
        body: rootData.body, legs: rootData.legs, head: rootData.head, tail: rootData.tail,
        home: new THREE.Vector2(x, z), target: new THREE.Vector2(x, z), think: .4 + seeded(slot + cx * 3, cz * 7) * 4, fleeCooldown: 0,
        mood: 'foraging', phase: seeded(cx * 11 + slot, cz * 13) * Math.PI * 2,
        direction: rootData.root.rotation.y, trust: initialTrust,
      });
    }
  }

  private chooseSpecies(biome: Biome, roll: number): Species {
    const pools: Record<Biome, Species[]> = {
      meadow: ['deer', 'rabbit', 'rabbit', 'fox', 'boar'],
      forest: ['deer', 'deer', 'rabbit', 'fox', 'wolf', 'boar'],
      wetland: ['duck', 'duck', 'boar', 'deer', 'rabbit'],
      alpine: ['deer', 'wolf', 'wolf', 'fox', 'rabbit'],
      shore: ['duck', 'duck', 'rabbit', 'fox'],
    };
    const pool = pools[biome];
    return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
  }

  removeChunk(key: string): void {
    for (const [id, animal] of this.animals) if (animal.chunkKey === key) this.animals.delete(id);
  }

  update(dt: number, player: THREE.Vector3, sprinting: boolean): void {
    this.elapsed += dt;
    for (const a of this.animals.values()) {
      const p = a.root.position, dx = player.x - p.x, dz = player.z - p.z, distance = Math.hypot(dx, dz);
      const trust = a.trust;
      a.fleeCooldown = Math.max(0, a.fleeCooldown - dt);
      const notice = (a.species === 'wolf' ? 10 : a.species === 'deer' ? 8 : 6.5) + trust * .65;
      const close = distance < (trust >= 2 ? 1.45 : 2.7);
      if (distance < notice && FLEEING.has(a.species) && (sprinting || trust < 2 || close) && a.mood !== 'fleeing' && a.fleeCooldown <= 0) {
        const inv = 1 / Math.max(distance, .001);
        const fleeDist = a.species === 'rabbit' || a.species === 'duck' ? 5.5 : 7;
        a.target.set(p.x - dx * inv * fleeDist, p.z - dz * inv * fleeDist);
        a.mood = 'fleeing'; a.think = 1.55; a.fleeCooldown = 3.2;
      } else if (distance < notice && trust >= 1 && a.mood !== 'fleeing') {
        a.mood = 'curious';
      }
      a.think -= dt;
      if (a.think <= 0 && a.mood !== 'fleeing') this.chooseNextTarget(a);
      if (a.think <= 0 && a.mood === 'fleeing') a.mood = trust >= 2 && distance < notice ? 'curious' : 'alert';

      const tx = a.target.x - p.x, tz = a.target.y - p.z, remaining = Math.hypot(tx, tz);
      const moving = remaining > .25;
      if (moving) {
        const desired = Math.atan2(tx, tz);
        a.direction += Math.atan2(Math.sin(desired - a.direction), Math.cos(desired - a.direction)) * Math.min(1, dt * 4.8);
        const speed = a.mood === 'fleeing' ? (a.species === 'rabbit' ? 5.2 : 4.2) : a.species === 'duck' ? .6 : .9 + a.trust * .04;
        const step = Math.min(remaining, speed * dt);
        const nx = p.x + Math.sin(a.direction) * step, nz = p.z + Math.cos(a.direction) * step;
        if (this.canStand(a.species, nx, nz, a.home, a.chunkKey)) {
          p.x = nx; p.z = nz;
          p.y = AQUATIC.has(a.species) ? 1.27 : this.options.heightAt(nx, nz);
        } else {
          a.think = 0; a.target.copy(a.home);
        }
      }
      a.root.rotation.y = a.direction;
      const gait = this.elapsed * (a.mood === 'fleeing' ? 13 : 6) + a.phase;
      a.body.position.y = Math.sin(this.elapsed * 2.2 + a.phase) * (moving ? .025 : .012);
      a.head.rotation.x = Math.sin(this.elapsed * 1.8 + a.phase) * (a.mood === 'foraging' ? .18 : .04);
      a.tail.rotation.y = Math.sin(this.elapsed * 4 + a.phase) * .16;
      for (let leg = 0; leg < a.legs.length; leg++)
        a.legs[leg].rotation.x = moving ? Math.sin(gait + (leg % 2) * Math.PI) * (a.mood === 'fleeing' ? .65 : .34) : 0;
    }
  }

  private canStand(species: Species, x: number, z: number, home: THREE.Vector2, chunkKey: string): boolean {
    const [cx, cz] = chunkKey.split(',').map(Number);
    const size = this.size;
    if (x < cx * size + 1 || x > (cx + 1) * size - 1 || z < cz * size + 1 || z > (cz + 1) * size - 1) return false;
    if (this.options.nearHome(x, z) || this.options.roadAt(x, z)) return false;
    const wet = this.options.waterAt(x, z);
    return AQUATIC.has(species) ? wet : !wet && Math.hypot(x - home.x, z - home.y) < 10;
  }

  private chooseNextTarget(a: AnimalState): void {
    const [cx, cz] = a.chunkKey.split(',').map(Number);
    const size = this.size;
    const turn = Math.floor(this.elapsed / 5 + a.phase * 3);
    for (let attempt = 0; attempt < 10; attempt++) {
      const r1 = seeded(Math.round(a.home.x * 19) + turn + attempt * 7, Math.round(a.home.y * 23) - turn * 3);
      const r2 = seeded(Math.round(a.home.x * 29) - turn * 5, Math.round(a.home.y * 31) + turn + attempt * 11);
      const radius = a.species === 'rabbit' ? 4.5 : 7;
      const angle = r1 * Math.PI * 2, distance = .8 + r2 * radius;
      const x = clamp(a.home.x + Math.sin(angle) * distance, cx * size + 1.5, (cx + 1) * size - 1.5);
      const z = clamp(a.home.y + Math.cos(angle) * distance, cz * size + 1.5, (cz + 1) * size - 1.5);
      if (this.canStand(a.species, x, z, a.home, a.chunkKey)) {
        a.target.set(x, z); a.mood = r1 < .22 ? 'resting' : r1 < .58 ? 'foraging' : 'wandering';
        a.think = 2.2 + r2 * 5.5; return;
      }
    }
    a.target.copy(a.home); a.mood = 'resting'; a.think = 2;
  }

  interact(root: THREE.Object3D): void {
    const data = root.userData.animal as { id: string; species: Species } | undefined;
    if (!data) return;
    const a = this.animals.get(data.id);
    if (!a) return;
    const name = SPECIES_NAME[a.species];
    if (this.options.hasFruit() && !AQUATIC.has(a.species) && a.species !== 'wolf' && a.trust < 5) {
      this.options.consumeFruit();
      a.trust = Math.min(5, a.trust + 1); this.trust[a.id] = a.trust;
      a.mood = 'curious'; a.think = 2.4;
      this.options.onTrustChange();
      const label = a.trust >= 4 ? 'seems comfortable nearby' : 'is becoming less wary';
      this.options.notify(`You offered fruit. The ${name.toLowerCase()} ${label}.`);
      return;
    }
    const note = a.species === 'deer' ? 'It browses quietly, listening for movement.'
      : a.species === 'rabbit' ? 'Its ears twitch as it sniffs the grass.'
      : a.species === 'fox' ? 'It watches you carefully, then noses through the undergrowth.'
      : a.species === 'wolf' ? 'It keeps its distance and studies the wind.'
      : a.species === 'boar' ? 'It roots through the soil for bulbs and fallen nuts.'
      : 'It paddles at the water’s edge and preens its feathers.';
    this.options.notify(`${name} · ${note}${this.options.hasFruit() ? '' : ' Find fruit to offer to a wild animal.'}`);
  }

  status(player: THREE.Vector3): string {
    let nearest: AnimalState | null = null, best = 24;
    for (const a of this.animals.values()) {
      const d = Math.hypot(a.root.position.x - player.x, a.root.position.z - player.z);
      if (d < best) { best = d; nearest = a; }
    }
    const nearby = [...this.animals.values()].filter(a => Math.hypot(a.root.position.x - player.x, a.root.position.z - player.z) < 35).length;
    return nearest ? `${SPECIES_ICON[nearest.species]} ${SPECIES_NAME[nearest.species]} · ${this.labelMood(nearest.mood)} · ${nearby} nearby` : `Wildlife · ${nearby} nearby`;
  }

  markers(): AnimalMarker[] {
    return [...this.animals.values()].map(a => ({ x: a.root.position.x, z: a.root.position.z, species: a.species }));
  }

  private labelMood(mood: Mood): string {
    return ({ resting: 'resting', foraging: 'foraging', wandering: 'wandering', alert: 'alert', fleeing: 'moving away', curious: 'curious' } as Record<Mood, string>)[mood];
  }
}

export const speciesColor = (species: Species): string => `#${SPECIES_COLOR[species].toString(16).padStart(6, '0')}`;
