import * as THREE from 'three';
export type SurvivalWeaponId = 'pistol' | 'shotgun' | 'rifle';

export interface SurvivalWeaponDef {
  id: SurvivalWeaponId;
  name: string;
  category: string;
  magSize: number;
  reserveMax: number;
  damage: number;
  pellets: number;
  spread: number;
  fireRate: number;
  reloadTime: number;
  range: number;
  recoilKick: number;
  recoilRecovery: number;
  automatic: boolean;
  modelColor: string;
  accentColor: string;
}

export const SURVIVAL_WEAPON_REGISTRY: Record<SurvivalWeaponId, SurvivalWeaponDef> = {
  pistol: {
    id: 'pistol',
    name: 'P9 Tactical 9mm',
    category: 'Sidearm',
    magSize: 15,
    reserveMax: 90,
    damage: 38,
    pellets: 1,
    spread: 0.022,
    fireRate: 4.5, // semi-auto, clicks per sec
    reloadTime: 1.4,
    range: 60,
    recoilKick: 0.05,
    recoilRecovery: 8.5,
    automatic: false,
    modelColor: '#1e293b',
    accentColor: '#38bdf8',
  },
  shotgun: {
    id: 'shotgun',
    name: 'W-870 Breacher',
    category: 'Shotgun',
    magSize: 8,
    reserveMax: 40,
    damage: 18, // 8 pellets * 18 = 144 dmg total point blank!
    pellets: 8,
    spread: 0.075,
    fireRate: 1.2,
    reloadTime: 2.2,
    range: 30,
    recoilKick: 0.14,
    recoilRecovery: 6.0,
    automatic: false,
    modelColor: '#27272a',
    accentColor: '#f97316',
  },
  rifle: {
    id: 'rifle',
    name: 'AR-15 SpecOps',
    category: 'Assault Rifle',
    magSize: 30,
    reserveMax: 150,
    damage: 30,
    pellets: 1,
    spread: 0.035,
    fireRate: 9.5, // automatic
    reloadTime: 1.8,
    range: 90,
    recoilKick: 0.042,
    recoilRecovery: 9.0,
    automatic: true,
    modelColor: '#18181b',
    accentColor: '#22c55e',
  },
};

export interface WeaponRig {
  root: THREE.Group;
  slideOrPump?: THREE.Mesh;
  muzzleFlash: THREE.Group;
  muzzleLight: THREE.PointLight;
  type: SurvivalWeaponId;
  basePos: THREE.Vector3;
  baseRot: THREE.Euler;
  adsPos: THREE.Vector3;
  adsRot: THREE.Euler;
}

/**
 * Builds high-fidelity procedural 3D weapon models.
 * Uses Three.js primitives with clean chamfers, metallic finishes, and glowing sights.
 */
export function createWeaponRig(type: SurvivalWeaponId): WeaponRig {
  const root = new THREE.Group();
  root.name = `weapon_${type}`;

  // Materials
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x1f242d,
    roughness: 0.35,
    metalness: 0.85,
  });
  const darkPolymerMat = new THREE.MeshStandardMaterial({
    color: 0x111317,
    roughness: 0.75,
    metalness: 0.2,
  });
  const sightGlowMat = new THREE.MeshBasicMaterial({
    color: 0x22ff55,
  });
  const holoReticleMat = new THREE.MeshBasicMaterial({
    color: 0xff3344,
  });

  let slideOrPump: THREE.Mesh | undefined;
  let muzzleLocalPos = new THREE.Vector3(0, 0, -0.4);

  // Position presets
  const basePos = new THREE.Vector3(0.18, -0.19, -0.38);
  const baseRot = new THREE.Euler(0, 0, 0);

  let adsPos = new THREE.Vector3(0, -0.14, -0.32);
  let adsRot = new THREE.Euler(0, 0, 0);

  if (type === 'pistol') {
    adsPos = new THREE.Vector3(0, -0.138, -0.3);

    // Grip
    const gripGeo = new THREE.BoxGeometry(0.045, 0.12, 0.06);
    const grip = new THREE.Mesh(gripGeo, darkPolymerMat);
    grip.position.set(0, -0.06, 0.03);
    grip.rotation.x = 0.25;
    root.add(grip);

    // Frame
    const frameGeo = new THREE.BoxGeometry(0.042, 0.04, 0.2);
    const frame = new THREE.Mesh(frameGeo, darkPolymerMat);
    frame.position.set(0, 0, -0.05);
    root.add(frame);

    // Recoiling Slide
    const slideGeo = new THREE.BoxGeometry(0.044, 0.042, 0.22);
    const slide = new THREE.Mesh(slideGeo, metalMat);
    slide.position.set(0, 0.024, -0.05);
    root.add(slide);
    slideOrPump = slide;

    // Barrel tip
    const barrelGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.08, 12);
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.024, -0.17);
    root.add(barrel);

    // Tritium Night Sights (Front & Rear dots)
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.01, 0.01), sightGlowMat);
    frontSight.position.set(0, 0.05, -0.15);
    slide.add(frontSight);

    const rearSightL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.008, 0.008), sightGlowMat);
    rearSightL.position.set(-0.015, 0.05, 0.05);
    slide.add(rearSightL);

    const rearSightR = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.008, 0.008), sightGlowMat);
    rearSightR.position.set(0.015, 0.05, 0.05);
    slide.add(rearSightR);

    muzzleLocalPos.set(0, 0.024, -0.22);
  } else if (type === 'shotgun') {
    adsPos = new THREE.Vector3(0, -0.155, -0.32);

    // Stock & Receiver
    const receiverGeo = new THREE.BoxGeometry(0.055, 0.08, 0.26);
    const receiver = new THREE.Mesh(receiverGeo, metalMat);
    receiver.position.set(0, 0, 0);
    root.add(receiver);

    const stockGeo = new THREE.BoxGeometry(0.048, 0.1, 0.28);
    const stock = new THREE.Mesh(stockGeo, darkPolymerMat);
    stock.position.set(0, -0.04, 0.22);
    root.add(stock);

    // Double barrels (magazine tube + main barrel)
    const barrelGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.55, 14);
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, -0.35);
    root.add(barrel);

    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.48, 14), metalMat);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.01, -0.32);
    root.add(magTube);

    // Movable Pump Fore-end
    const pumpGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.18, 12);
    const pump = new THREE.Mesh(pumpGeo, darkPolymerMat);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.01, -0.26);
    root.add(pump);
    slideOrPump = pump;

    // Front bead sight
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 8), sightGlowMat);
    bead.position.set(0, 0.045, -0.6);
    root.add(bead);

    muzzleLocalPos.set(0, 0.025, -0.63);
  } else if (type === 'rifle') {
    adsPos = new THREE.Vector3(0, -0.178, -0.32);

    // Upper & Lower Receiver
    const receiverGeo = new THREE.BoxGeometry(0.052, 0.09, 0.28);
    const receiver = new THREE.Mesh(receiverGeo, metalMat);
    root.add(receiver);

    // Tactical Stock
    const stockGeo = new THREE.BoxGeometry(0.044, 0.08, 0.22);
    const stock = new THREE.Mesh(stockGeo, darkPolymerMat);
    stock.position.set(0, -0.02, 0.24);
    root.add(stock);

    // Handguard
    const handguardGeo = new THREE.BoxGeometry(0.048, 0.055, 0.32);
    const handguard = new THREE.Mesh(handguardGeo, darkPolymerMat);
    handguard.position.set(0, 0.01, -0.28);
    root.add(handguard);

    // Barrel + Muzzle Brake
    const rifleBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 12), metalMat);
    rifleBarrel.rotation.x = Math.PI / 2;
    rifleBarrel.position.set(0, 0.01, -0.52);
    root.add(rifleBarrel);

    // Curved High-Cap Magazine
    const magGeo = new THREE.BoxGeometry(0.038, 0.18, 0.07);
    const mag = new THREE.Mesh(magGeo, darkPolymerMat);
    mag.position.set(0, -0.11, -0.06);
    mag.rotation.x = -0.2;
    root.add(mag);

    // Pistol Grip
    const gripGeo = new THREE.BoxGeometry(0.04, 0.12, 0.05);
    const grip = new THREE.Mesh(gripGeo, darkPolymerMat);
    grip.position.set(0, -0.08, 0.1);
    grip.rotation.x = 0.3;
    root.add(grip);

    // Holographic Sight Mount & Glass Reticle
    const sightMount = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.04, 0.09), darkPolymerMat);
    sightMount.position.set(0, 0.065, -0.04);
    root.add(sightMount);

    const holoGlass = new THREE.Mesh(
      new THREE.RingGeometry(0.008, 0.013, 16),
      holoReticleMat
    );
    holoGlass.position.set(0, 0.072, -0.08);
    root.add(holoGlass);

    muzzleLocalPos.set(0, 0.01, -0.65);
  }

  // Muzzle flash rig
  const muzzleFlash = new THREE.Group();
  muzzleFlash.position.copy(muzzleLocalPos);

  const flashGeo = new THREE.OctahedronGeometry(0.08, 0);
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffe066,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const flashMesh = new THREE.Mesh(flashGeo, flashMat);
  flashMesh.scale.set(1, 1, 2);
  muzzleFlash.add(flashMesh);

  const muzzleLight = new THREE.PointLight(0xffa500, 0, 8);
  muzzleFlash.add(muzzleLight);

  root.add(muzzleFlash);

  root.position.copy(basePos);
  root.rotation.copy(baseRot);

  return {
    root,
    slideOrPump,
    muzzleFlash,
    muzzleLight,
    type,
    basePos,
    baseRot,
    adsPos,
    adsRot,
  };
}
