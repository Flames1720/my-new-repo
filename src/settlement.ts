import * as THREE from 'three';
import {
  HOME_X,
  HOME_Z,
  VILLAGE_X,
  VILLAGE_Z,
  terrainHeightAt,
  isBridgeAt,
} from './terrain';
import type { HomeLevel } from './types';

// Materials
const wallMat = new THREE.MeshStandardMaterial({ color: 0xded6c4, roughness: 0.88 });
const timberMat = new THREE.MeshStandardMaterial({ color: 0x5b3e2b, roughness: 0.95 });
const floorMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4d, roughness: 0.95 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x764232, roughness: 0.85 });
const roofMatLevel3 = new THREE.MeshStandardMaterial({ color: 0x3d4b56, roughness: 0.85 });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x787a7d, roughness: 0.96 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x24323d, roughness: 0.7 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x98cfdb, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.8 });
const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffdd88, emissive: 0xffaa33, emissiveIntensity: 0.8 });
const foliageMat = new THREE.MeshStandardMaterial({ color: 0x3e7b41, roughness: 0.9 });
const flowerMat = new THREE.MeshStandardMaterial({ color: 0xdd4b68, roughness: 0.8 });

export const HOME_UPGRADE_COSTS: Record<HomeLevel, { wood: number; stone: number; ore: number; title: string }> = {
  1: { wood: 0, stone: 0, ore: 0, title: 'Starter Pioneer Cabin' },
  2: { wood: 10, stone: 5, ore: 0, title: 'Timber Homestead (Porch & Chimney)' },
  3: { wood: 22, stone: 14, ore: 2, title: 'Grand Mountain Manor (Balcony & Hearth)' },
};

export function buildHome(level: HomeLevel, isDoorOpen: boolean): THREE.Group {
  const h = new THREE.Group();
  h.name = 'home';
  const hy = terrainHeightAt(HOME_X, HOME_Z);
  h.position.set(HOME_X, hy, HOME_Z);

  const wallH = 3.6, th = 0.25, halfW = 4.5, halfD = 3.5;

  // Base Foundation & Floor
  const foundationMat = level >= 2 ? stoneMat : floorMat;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.22, 7), foundationMat);
  floor.position.y = 0.11;
  floor.name = 'home-floor';
  h.add(floor);

  // Main Walls
  const back = new THREE.Mesh(new THREE.BoxGeometry(9, wallH, th), wallMat);
  back.position.set(0, wallH / 2, -halfD);
  const left = new THREE.Mesh(new THREE.BoxGeometry(th, wallH, 7), wallMat);
  left.position.set(-halfW, wallH / 2, 0);
  const right = new THREE.Mesh(new THREE.BoxGeometry(th, wallH, 7), wallMat);
  right.position.set(halfW, wallH / 2, 0);
  const frontL = new THREE.Mesh(new THREE.BoxGeometry(3.95, wallH, th), wallMat);
  frontL.position.set(-2.525, wallH / 2, halfD);
  const frontR = new THREE.Mesh(new THREE.BoxGeometry(3.95, wallH, th), wallMat);
  frontR.position.set(2.525, wallH / 2, halfD);
  const frontTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, th), wallMat);
  frontTop.position.set(0, 2.85, halfD);
  [back, left, right, frontL, frontR, frontTop].forEach((w, i) => {
    w.name = `home-wall-${i}`;
    h.add(w);
  });

  // Corner timber pillars
  for (const sx of [-halfW, halfW]) {
    for (const sz of [-halfD, halfD]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.38, wallH, 0.38), timberMat);
      post.position.set(sx, wallH / 2, sz);
      h.add(post);
    }
  }

  // Front Door
  const doorPivot = new THREE.Group();
  doorPivot.name = 'front-door';
  doorPivot.position.set(-0.55, 0, halfD + 0.04);
  doorPivot.userData.interactable = { action: 'toggleDoor', label: 'Front door' };
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.08), timberMat);
  door.position.set(0.55, 1.05, 0);
  door.name = 'front-door-panel';
  doorPivot.add(door);
  doorPivot.rotation.y = isDoorOpen ? -Math.PI / 2 : 0;
  h.add(doorPivot);

  // Windows with glass panes
  const winL = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.1), glassMat);
  winL.position.set(-2.3, 1.8, halfD + 0.05);
  winL.name = 'window-l';
  winL.userData.interactable = { action: 'inspect', label: 'Sunlight Window' };
  h.add(winL);

  const winR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.1), glassMat);
  winR.position.set(2.3, 1.8, halfD + 0.05);
  winR.name = 'window-r';
  h.add(winR);

  // Interior Furniture
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.48, 3.2), new THREE.MeshStandardMaterial({ color: 0x5a7185 }));
  bed.position.set(-2.4, 0.38, -1.35);
  bed.name = 'bed';
  bed.userData.interactable = { action: 'rest', label: 'Cozy Bed (Sleep till Dawn)' };
  h.add(bed);

  const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.6), new THREE.MeshStandardMaterial({ color: 0xe6e2d8 }));
  pillow.position.set(0, 0.3, -1.1);
  bed.add(pillow);

  // Interior Dining Table & Chairs
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.2), timberMat);
  table.position.set(2.4, 0.5, -1.1);
  table.name = 'table';
  table.userData.interactable = { action: 'inspect', label: 'Cozy Dining Table & Chairs' };
  h.add(table);

  // Chairs around dining table
  for (const cz of [-1.8, -0.4]) {
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), timberMat);
    chair.position.set(2.4, 0.25, cz);
    h.add(chair);
  }

  // Workshop Crafting Shed attached to cabin side (with solid wooden deck platform)
  const workshopDeck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 3.2), floorMat);
  workshopDeck.position.set(halfW + 1.8, 0.11, 0.5);
  h.add(workshopDeck);

  const workshopAwning = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 3.4), roofMat);
  workshopAwning.position.set(halfW + 1.8, 2.7, 0.5);
  workshopAwning.rotation.z = -0.06;
  h.add(workshopAwning);

  const workshopPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), timberMat);
  workshopPost.position.set(halfW + 3.4, 1.3, 1.9);
  h.add(workshopPost);

  // Carpenter Workbench on Workshop Deck
  const bench = new THREE.Group();
  bench.name = 'carpenter-workbench';
  bench.position.set(halfW + 1.8, 0.22, 0.5);
  bench.userData.interactable = { action: 'homeWorkshop', label: 'Carpenter Workbench (Upgrade Home & Crafting)' };
  const benchTop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.9), timberMat);
  benchTop.position.y = 0.85;
  bench.add(benchTop);
  for (const bx of [-0.7, 0.7]) {
    for (const bz of [-0.3, 0.3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), timberMat);
      leg.position.set(bx, 0.425, bz);
      bench.add(leg);
    }
  }
  const toolVice = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.35), stoneMat);
  toolVice.position.set(-0.6, 1.0, 0.2);
  bench.add(toolVice);
  h.add(bench);

  // LEVEL 1: Starter Roof
  if (level === 1) {
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.4, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 4.8;
    roof.name = 'home-roof';
    h.add(roof);
  }

  // LEVEL 2: Porch, Chimney, Planter boxes
  if (level >= 2) {
    // Porch
    const porchDeck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.22, 2.5), timberMat);
    porchDeck.position.set(0, 0.11, halfD + 1.25);
    h.add(porchDeck);

    // Porch posts & roof awning
    for (const px of [-4.2, 4.2]) {
      const pPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.8, 6), timberMat);
      pPost.position.set(px, 1.4, halfD + 2.3);
      h.add(pPost);
    }
    const awning = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.18, 2.8), roofMat);
    awning.position.set(0, 2.8, halfD + 1.3);
    awning.rotation.x = 0.08;
    h.add(awning);

    // Hanging Lantern on porch
    const lantern = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22), lanternMat);
    lantern.position.set(-0.55, 2.4, halfD + 0.3);
    h.add(lantern);

    // Stone Chimney
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.8, 1.2), stoneMat);
    chimney.position.set(-halfW + 0.5, 2.8, -halfD + 1.0);
    chimney.name = 'chimney';
    h.add(chimney);

    // Flower planter box
    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.35), timberMat);
    planter.position.set(-2.3, 1.1, halfD + 0.25);
    h.add(planter);
    const flowers = new THREE.Mesh(new THREE.SphereGeometry(0.25, 5, 4), flowerMat);
    flowers.position.set(-2.3, 1.35, halfD + 0.25);
    h.add(flowers);

    // Level 2 Roof
    if (level === 2) {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(6.6, 2.5, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 4.85;
      roof.name = 'home-roof';
      h.add(roof);
    }
  }

  // LEVEL 3: Manor Balcony & Second Story Loft & Grand Fireplace
  if (level === 3) {
    // Second story loft
    const loftH = 2.4;
    const loft = new THREE.Mesh(new THREE.BoxGeometry(8.2, loftH, 6.2), wallMat);
    loft.position.set(0, wallH + loftH / 2, 0);
    h.add(loft);

    // Balcony
    const balcony = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.18, 2.2), timberMat);
    balcony.position.set(0, wallH + 0.1, halfD + 0.6);
    h.add(balcony);

    // Balcony Railings
    const railFront = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.8, 0.08), timberMat);
    railFront.position.set(0, wallH + 0.5, halfD + 1.6);
    h.add(railFront);

    // Loft Windows
    const loftWin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.1), glassMat);
    loftWin.position.set(0, wallH + 1.2, halfD + 0.05);
    h.add(loftWin);

    // Manor Slate Gabled Roof
    const roof3 = new THREE.Mesh(new THREE.ConeGeometry(7.0, 2.8, 4), roofMatLevel3);
    roof3.rotation.y = Math.PI / 4;
    roof3.position.y = wallH + loftH + 1.4;
    roof3.name = 'home-roof-manor';
    h.add(roof3);

    // Outdoor Campfire & Stone Hearth
    const hearth = new THREE.Group();
    hearth.position.set(-5.5, 0, 4.0);
    hearth.userData.interactable = { action: 'inspect', label: 'Cozy Stone Hearth & Firepit' };
    const pitRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.22, 6, 12), stoneMat);
    pitRing.rotation.x = Math.PI / 2;
    hearth.add(pitRing);
    const fireGlow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 5), lanternMat);
    fireGlow.position.y = 0.3;
    hearth.add(fireGlow);
    h.add(hearth);
  }

  h.userData.collider = {
    minX: HOME_X - halfW,
    maxX: HOME_X + halfW,
    minZ: HOME_Z - halfD,
    maxZ: HOME_Z + halfD + (level >= 2 ? 2.5 : 0),
    doorMinX: HOME_X - 0.55,
    doorMaxX: HOME_X + 0.55,
    wallThickness: 0.25,
  };
  h.userData.doorOpen = isDoorOpen;

  h.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return h;
}

// Build Riverwood Village structures
export function buildVillage(g: THREE.Group): void {
  const vy = terrainHeightAt(VILLAGE_X, VILLAGE_Z);
  const villageGroup = new THREE.Group();
  villageGroup.name = 'riverwood-village';
  villageGroup.position.set(VILLAGE_X, vy, VILLAGE_Z);

  // Village Signpost
  const signpost = new THREE.Group();
  signpost.position.set(-8, 0, 6);
  signpost.userData.interactable = { action: 'inspect', label: 'Signpost: Riverwood Hamlet · Home (West 60m)' };
  const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.2, 6), timberMat);
  signPole.position.y = 1.1;
  signpost.add(signPole);
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.08), timberMat);
  signBoard.position.set(0.4, 1.8, 0);
  signpost.add(signBoard);
  villageGroup.add(signpost);

  // Village Cottage 1 (Elder Cabin)
  const cab1 = buildVillageCottage('Cottage · Riverwood', 0xded6c4, 0x6e3d2d);
  cab1.position.set(-6, 0, -5);
  cab1.rotation.y = 0.2;
  villageGroup.add(cab1);

  // Village Cottage 2 (Fisherman Cabin)
  const cab2 = buildVillageCottage('Lakeside Hut', 0xc9baa2, 0x5a3628);
  cab2.position.set(7, 0, -4);
  cab2.rotation.y = -0.3;
  villageGroup.add(cab2);

  // Village Cottage 3 (Herbalist Cottage)
  const cab3 = buildVillageCottage('Herbalist Lodge', 0xd3cbbe, 0x485848);
  cab3.position.set(1, 0, 7);
  cab3.rotation.y = Math.PI - 0.15;
  villageGroup.add(cab3);

  // Central Village Well
  const well = new THREE.Group();
  well.name = 'village-well';
  well.position.set(0, 0, 0);
  well.userData.interactable = { action: 'inspect', label: 'Riverwood Village Well (Fresh Spring Water)' };
  const wellStone = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.85, 8), stoneMat);
  wellStone.position.y = 0.42;
  well.add(wellStone);
  const wellWater = new THREE.Mesh(new THREE.CircleGeometry(0.85, 8), new THREE.MeshStandardMaterial({ color: 0x2e6f85 }));
  wellWater.rotation.x = -Math.PI / 2;
  wellWater.position.y = 0.65;
  well.add(wellWater);
  // Well roof posts
  for (const wx of [-0.9, 0.9]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.8, 5), timberMat);
    post.position.set(wx, 1.2, 0);
    well.add(post);
  }
  const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.9, 4), roofMat);
  wellRoof.rotation.y = Math.PI / 4;
  wellRoof.position.y = 2.4;
  well.add(wellRoof);
  villageGroup.add(well);

  // Riverwood Trading Post & Elder Oladele
  const trader = new THREE.Group();
  trader.name = 'elder-oladele';
  trader.position.set(4.5, 0, -1.5);
  trader.userData.interactable = { action: 'talkElder', label: 'Elder Oladele (Riverwood Trading Post & Life Jobs)' };
  const stallTable = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 1.2), timberMat);
  stallTable.position.y = 0.425;
  trader.add(stallTable);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 1.6), new THREE.MeshStandardMaterial({ color: 0x2d6b4f }));
  canopy.position.y = 2.2;
  trader.add(canopy);
  for (const cx of [-1.1, 1.1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), timberMat);
    post.position.set(cx, 1.1, 0.6);
    trader.add(post);
  }
  // Goods on display (crate with apples, rolled parchment)
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.5), timberMat);
  crate.position.set(-0.6, 1.05, 0);
  trader.add(crate);
  const lantern = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18), lanternMat);
  lantern.position.set(0.7, 1.05, 0);
  trader.add(lantern);
  villageGroup.add(trader);

  // Village Hearth / Campfire with log seats
  const hearth = new THREE.Group();
  hearth.position.set(-3.5, 0, 2.5);
  hearth.userData.interactable = { action: 'inspect', label: 'Village Gathering Campfire' };
  const pit = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.18, 5, 10), stoneMat);
  pit.rotation.x = Math.PI / 2;
  hearth.add(pit);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 5), lanternMat);
  flame.position.y = 0.25;
  hearth.add(flame);
  // Log benches around campfire
  for (let b = 0; b < 3; b++) {
    const angle = b * (Math.PI * 2 / 3);
    const bench = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.6, 6), timberMat);
    bench.rotation.z = Math.PI / 2;
    bench.rotation.y = angle;
    bench.position.set(Math.cos(angle) * 1.6, 0.2, Math.sin(angle) * 1.6);
    hearth.add(bench);
  }
  villageGroup.add(hearth);

  // Wooden Pier extending to river/lake
  const pier = new THREE.Group();
  pier.position.set(12, 0, -8);
  pier.rotation.y = -0.5;
  pier.userData.interactable = { action: 'inspect', label: 'Riverwood Fishing Pier' };
  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 8.0), timberMat);
  pierDeck.position.set(0, 0.1, 4.0);
  pier.add(pierDeck);
  for (const pz of [1.5, 4.5, 7.5]) {
    for (const px of [-1.1, 1.1]) {
      const pPost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6), timberMat);
      pPost.position.set(px, -0.6, pz);
      pier.add(pPost);
    }
  }
  const pierLantern = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22), lanternMat);
  pierLantern.position.set(0.9, 1.4, 7.8);
  pier.add(pierLantern);
  villageGroup.add(pier);

  villageGroup.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  g.add(villageGroup);
}

function buildVillageCottage(name: string, wallColor: number, roofColor: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `village-${name.toLowerCase().replace(/\s+/g, '-')}`;
  g.userData.interactable = { action: 'inspect', label: name };

  const w = 5.2, h = 2.8, d = 4.2;
  const cWallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 });
  const cRoofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.85 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cWallMat);
  body.position.y = h / 2;
  g.add(body);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 1.8, 4), cRoofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 0.9;
  g.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.1), timberMat);
  door.position.set(0, 0.85, d / 2 + 0.05);
  g.add(door);

  const win = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.1), glassMat);
  win.position.set(1.4, 1.5, d / 2 + 0.05);
  g.add(win);

  return g;
}

// Wooden Bridge when road crosses water
export function buildBridge(x: number, z: number, rotationY = 0): THREE.Group {
  const b = new THREE.Group();
  b.name = 'wooden-bridge';
  b.position.set(x, terrainHeightAt(x, z) + 0.12, z);
  b.rotation.y = rotationY;

  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.28, 9.5), timberMat);
  b.add(deck);

  // Railings
  for (const rx of [-2.7, 2.7]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 9.5), timberMat);
    rail.position.set(rx, 0.5, 0);
    b.add(rail);

    for (const rz of [-4.2, 0, 4.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.2, 6), timberMat);
      post.position.set(rx, 0.6, rz);
      b.add(post);
    }
    // Lantern on center post
    const lantern = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2), lanternMat);
    lantern.position.set(rx, 1.4, 0);
    b.add(lantern);
  }

  b.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return b;
}
