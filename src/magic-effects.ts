import * as THREE from 'three';

export type MagicElement = 'fire' | 'lightning' | 'wind' | 'water' | 'dark' | 'purification';

const ELEMENT_COLORS: Record<MagicElement, number> = {
  fire: 0xff6b35,
  lightning: 0xf7ed73,
  wind: 0x9ff5d1,
  water: 0x58a6ff,
  dark: 0x9b6cff,
  purification: 0xbdfcff,
};

export function magicColor(element: MagicElement): THREE.Color {
  return new THREE.Color(ELEMENT_COLORS[element]);
}

/** A small emissive hand/projectile orb made only from Three.js primitives. */
export function createMagicOrb(element: MagicElement, radius = 0.1): THREE.Group {
  const color = magicColor(element);
  const group = new THREE.Group();
  group.name = `magic-orb-${element}`;
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material);
  group.add(orb);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.45, radius * 0.12, 5, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })
  );
  halo.rotation.x = Math.PI / 2;
  group.add(halo);
  return group;
}

/** A reusable radial burst for spell release or impact moments. */
export function createMagicBurst(element: MagicElement, radius = 0.35): THREE.Group {
  const color = magicColor(element);
  const group = new THREE.Group();
  group.name = `magic-burst-${element}`;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.2, radius, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.18, 8, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
  );
  group.add(core);
  return group;
}

/**
 * Tiny pooled-friendly projectile visual. The caller owns the group and removes
 * it when lifetime reaches zero; no textures, shaders or external assets needed.
 */
export class MagicProjectileEffect {
  readonly object: THREE.Group;
  private readonly velocity: THREE.Vector3;
  private age = 0;
  readonly lifetime: number;

  constructor(element: MagicElement, origin: THREE.Vector3, direction: THREE.Vector3, speed = 8, lifetime = 1.2) {
    this.object = createMagicOrb(element, 0.11);
    this.object.position.copy(origin);
    this.velocity = direction.clone().normalize().multiplyScalar(speed);
    this.lifetime = lifetime;
  }

  update(dt: number): boolean {
    this.age += dt;
    this.object.position.addScaledVector(this.velocity, dt);
    this.object.rotation.y += dt * 5;
    const fade = Math.max(0, 1 - this.age / this.lifetime);
    this.object.scale.setScalar(0.65 + fade * 0.55);
    return this.age < this.lifetime;
  }
}
