import * as THREE from 'three';
import {
  HOME_X,
  HOME_Z,
  VILLAGE_X,
  VILLAGE_Z,
  WORLD_RADIUS,
  WORLD_DIAMETER,
  SIZE,
  waterAt,
  roadAt,
  mountainMaskAt,
  isRiverAt,
  queryWorldFields,
} from './terrain';
import type { AnimalMarker, BreadcrumbPoint, Waypoint } from './types';
import { speciesColor } from './fauna';

function getMapTileColor(wx: number, wz: number): string {
  if (roadAt(wx, wz)) return '#525861';

  const wf = queryWorldFields(wx, wz);
  if (wf.waterType === 'lake' || wf.waterType === 'river' || wf.waterType === 'stream' || waterAt(wx, wz)) {
    return wf.waterType === 'lake' ? '#27688a' : '#3282a8';
  }
  if (wf.landform === 'peak' || wf.elevation > 48.0) return '#e6edf2'; // Alpine snowcap
  if (wf.landform === 'mountain_ridge' || wf.elevation > 32.0) return '#6b6c70'; // High granite
  if (wf.landform === 'foothills' || wf.landform === 'mountain_slope') return '#586b53';
  if (wf.biome === 'forest') return '#355c32';
  if (wf.biome === 'wetland') return '#446651';
  if (wf.rainfall < 0.28) return '#7a7652'; // Rain shadow dry shrub
  return '#4e733f'; // Lush meadow
}

export class MinimapSystem {
  private miniCanvas: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private fullCanvas: HTMLCanvasElement;
  private fullCtx: CanvasRenderingContext2D;
  private fullOverlay: HTMLElement;

  private trail: BreadcrumbPoint[] = [];
  private lastTrailRecordTime = 0;
  private customWaypoint: Waypoint | null = null;
  private isFullOpen = false;

  constructor(
    miniCanvas: HTMLCanvasElement,
    fullCanvas: HTMLCanvasElement,
    fullOverlay: HTMLElement,
    onOpenChange?: (open: boolean) => void
  ) {
    this.miniCanvas = miniCanvas;
    this.miniCtx = miniCanvas.getContext('2d')!;
    this.fullCanvas = fullCanvas;
    this.fullCtx = fullCanvas.getContext('2d')!;
    this.fullOverlay = fullOverlay;

    // Load saved trail & waypoint
    try {
      const savedTrail = localStorage.getItem('world_trail_v1');
      if (savedTrail) this.trail = JSON.parse(savedTrail);
      const savedWp = localStorage.getItem('world_waypoint_v1');
      if (savedWp) this.customWaypoint = JSON.parse(savedWp);
    } catch {}

    // Tap on mini canvas opens full map
    this.miniCanvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      this.setFullMap(true);
      if (onOpenChange) onOpenChange(true);
    });

    // Tap on full canvas sets/clears waypoint
    this.fullCanvas.addEventListener('pointerdown', e => {
      const rect = this.fullCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      this.handleFullMapClick(clickX, clickY);
    });
  }

  setFullMap(open: boolean): void {
    this.isFullOpen = open;
    this.fullOverlay.classList.toggle('show', open);
  }

  isOpen(): boolean {
    return this.isFullOpen;
  }

  recordPosition(x: number, z: number): void {
    const now = performance.now();
    if (now - this.lastTrailRecordTime < 450) return;

    if (this.trail.length > 0) {
      const last = this.trail[this.trail.length - 1];
      const d = Math.hypot(x - last.x, z - last.z);
      if (d < 1.4) return;
    }

    this.trail.push({ x, z, time: Date.now() });
    if (this.trail.length > 300) {
      this.trail.shift();
    }
    this.lastTrailRecordTime = now;

    if (this.trail.length % 20 === 0) {
      try {
        localStorage.setItem('world_trail_v1', JSON.stringify(this.trail.slice(-150)));
      } catch {}
    }
  }

  getWaypoint(): Waypoint | null {
    return this.customWaypoint;
  }

  private handleFullMapClick(clickX: number, clickY: number): void {
    const cw = this.fullCanvas.clientWidth;
    const ch = this.fullCanvas.clientHeight;
    const pad = 18;
    const cell = Math.min((cw - pad * 2) / WORLD_DIAMETER, (ch - pad * 2) / WORLD_DIAMETER);
    const mapOriginX = pad;
    const mapOriginY = pad;

    const gridX = (clickX - mapOriginX) / cell - WORLD_RADIUS;
    const gridZ = (clickY - mapOriginY) / cell - WORLD_RADIUS;

    const worldX = Math.round(gridX * SIZE);
    const worldZ = Math.round(gridZ * SIZE);

    if (Math.abs(gridX) <= WORLD_RADIUS && Math.abs(gridZ) <= WORLD_RADIUS) {
      if (this.customWaypoint && Math.hypot(this.customWaypoint.x - worldX, this.customWaypoint.z - worldZ) < 14) {
        this.customWaypoint = null;
      } else {
        this.customWaypoint = { x: worldX, z: worldZ, label: `Waypoint (${worldX}, ${worldZ})` };
      }
      try {
        localStorage.setItem('world_waypoint_v1', JSON.stringify(this.customWaypoint));
      } catch {}
    }
  }

  // --- RENDER LIVE CODM-STYLE RADAR MINI-MAP ---
  renderMini(playerPos: THREE.Vector3, camYaw: number, animals: AnimalMarker[]): void {
    const c = this.miniCanvas;
    if (!c || c.clientWidth < 12 || c.clientHeight < 12) return;

    const ctx = this.miniCtx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const size = c.clientWidth;
    const radius = size / 2;
    if (radius < 10) return;

    const cx = radius;
    const cy = radius;

    ctx.clearRect(0, 0, size, size);

    // Circular radar clipping mask
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, radius - 2), 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0f171fdc';
    ctx.fillRect(0, 0, size, size);

    const viewRange = 55;
    const scale = (radius - 8) / viewRange;

    // Helper: convert relative world displacement (dx, dz) to radar screen (sx, sy)
    // where screen UP is directly forward in the player's view direction
    const cosY = Math.cos(camYaw);
    const sinY = Math.sin(camYaw);
    const toRadar = (wx: number, wz: number): { x: number; y: number } => {
      const dx = wx - playerPos.x;
      const dz = wz - playerPos.z;
      const sx = cx + (dx * cosY - dz * sinY) * scale;
      const sy = cy - (dx * sinY + dz * cosY) * scale;
      return { x: sx, y: sy };
    };

    // Draw local terrain tiles
    const chunkMinX = Math.floor((playerPos.x - viewRange) / SIZE);
    const chunkMaxX = Math.ceil((playerPos.x + viewRange) / SIZE);
    const chunkMinZ = Math.floor((playerPos.z - viewRange) / SIZE);
    const chunkMaxZ = Math.ceil((playerPos.z + viewRange) / SIZE);

    for (let gx = chunkMinX; gx <= chunkMaxX; gx++) {
      for (let gz = chunkMinZ; gz <= chunkMaxZ; gz++) {
        const wx = gx * SIZE + SIZE / 2;
        const wz = gz * SIZE + SIZE / 2;
        if (Math.hypot(wx - playerPos.x, wz - playerPos.z) > viewRange + SIZE) continue;

        const p0 = toRadar(gx * SIZE, gz * SIZE);
        const p1 = toRadar((gx + 1) * SIZE, gz * SIZE);
        const p2 = toRadar((gx + 1) * SIZE, (gz + 1) * SIZE);
        const p3 = toRadar(gx * SIZE, (gz + 1) * SIZE);

        ctx.fillStyle = getMapTileColor(wx, wz);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    // --- DRAW DISPLACEMENT TRAILS (BREADCRUMBS) ---
    if (this.trail.length > 1) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < this.trail.length; i++) {
        const pt = this.trail[i];
        if (Math.hypot(pt.x - playerPos.x, pt.z - playerPos.z) > viewRange * 1.5) continue;
        const sp = toRadar(pt.x, pt.z);
        if (!started) {
          ctx.moveTo(sp.x, sp.y);
          started = true;
        } else {
          ctx.lineTo(sp.x, sp.y);
        }
      }
      ctx.strokeStyle = '#4de0ffbb';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Home Icon on Radar
    const homePt = toRadar(HOME_X, HOME_Z);
    if (Math.hypot(homePt.x - cx, homePt.y - cy) < radius - 4) {
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.arc(homePt.x, homePt.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw Village Icon on Radar
    const vPt = toRadar(VILLAGE_X, VILLAGE_Z);
    if (Math.hypot(vPt.x - cx, vPt.y - cy) < radius - 4) {
      ctx.fillStyle = '#ff7744';
      ctx.beginPath();
      ctx.arc(vPt.x, vPt.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Waypoint on Radar
    if (this.customWaypoint) {
      const wpPt = toRadar(this.customWaypoint.x, this.customWaypoint.z);
      if (Math.hypot(wpPt.x - cx, wpPt.y - cy) < radius - 4) {
        ctx.fillStyle = '#33ccff';
        ctx.beginPath();
        ctx.arc(wpPt.x, wpPt.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Nearby Animals as radar blips
    for (const a of animals) {
      const aPt = toRadar(a.x, a.z);
      if (Math.hypot(aPt.x - cx, aPt.y - cy) < radius - 8) {
        ctx.fillStyle = speciesColor(a.species);
        ctx.beginPath();
        ctx.arc(aPt.x, aPt.y, a.isBaby ? 2.2 : 3.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Radar Concentric Distance Rings
    ctx.strokeStyle = '#ffffff20';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, (radius - 8) * 0.5), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, radius - 8), 0, Math.PI * 2);
    ctx.stroke();

    // Center Player Arrowhead (Points directly FORWARD/UP on radar)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx - 5.5, cy + 6.5);
    ctx.lineTo(cx, cy + 3.5);
    ctx.lineTo(cx + 5.5, cy + 6.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0b1015';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // North Needle on Outer Rim
    // North is (0, -1) in world space (z decreases going north)
    const northAngle = Math.atan2(-sinY, -cosY);
    const nx = cx + Math.sin(northAngle) * (radius - 9);
    const ny = cy - Math.cos(northAngle) * (radius - 9);
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);

    ctx.restore();

    // Outer Radar Frame & Cyan Glow
    ctx.strokeStyle = '#38d2ff88';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, radius - 2), 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- RENDER FULL WORLD MAP ---
  renderFull(playerPos: THREE.Vector3, camYaw: number, animals: AnimalMarker[]): void {
    if (!this.isFullOpen) return;

    const c = this.fullCanvas;
    if (!c || c.clientWidth < 12 || c.clientHeight < 12) return;
    const ctx = this.fullCtx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cw = c.clientWidth;
    const ch = c.clientHeight;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#0e151c';
    ctx.fillRect(0, 0, cw, ch);

    const pad = 18;
    const cell = Math.min((cw - pad * 2) / WORLD_DIAMETER, (ch - pad * 2) / WORLD_DIAMETER);
    const mapOriginX = pad;
    const mapOriginY = pad;

    // Render world grid tiles (Top is North / -Z, Bottom is South / +Z)
    for (let cz = -WORLD_RADIUS; cz <= WORLD_RADIUS; cz++) {
      for (let cx = -WORLD_RADIUS; cx <= WORLD_RADIUS; cx++) {
        const sx = mapOriginX + (cx + WORLD_RADIUS) * cell;
        const sy = mapOriginY + (cz + WORLD_RADIUS) * cell;
        const wx = cx * SIZE + SIZE / 2;
        const wz = cz * SIZE + SIZE / 2;

        ctx.fillStyle = getMapTileColor(wx, wz);
        ctx.fillRect(sx, sy, Math.ceil(cell) + 0.5, Math.ceil(cell) + 0.5);
      }
    }

    // Displacement Trails (Breadcrumbs)
    if (this.trail.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < this.trail.length; i++) {
        const pt = this.trail[i];
        const tx = mapOriginX + (pt.x / SIZE + WORLD_RADIUS + 0.5) * cell;
        const ty = mapOriginY + (pt.z / SIZE + WORLD_RADIUS + 0.5) * cell;
        if (i === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.strokeStyle = '#42e4ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      for (let i = 0; i < this.trail.length; i += 8) {
        const pt = this.trail[i];
        const tx = mapOriginX + (pt.x / SIZE + WORLD_RADIUS + 0.5) * cell;
        const ty = mapOriginY + (pt.z / SIZE + WORLD_RADIUS + 0.5) * cell;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tx, ty, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Home Badge
    const hx = mapOriginX + (HOME_X / SIZE + WORLD_RADIUS + 0.5) * cell;
    const hy = mapOriginY + (HOME_Z / SIZE + WORLD_RADIUS + 0.5) * cell;
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(hx - cell * 0.45, hy - cell * 0.45, cell * 0.9, cell * 0.9);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(hx - cell * 0.45, hy - cell * 0.45, cell * 0.9, cell * 0.9);

    // Village Badge
    const vx = mapOriginX + (VILLAGE_X / SIZE + WORLD_RADIUS + 0.5) * cell;
    const vy = mapOriginY + (VILLAGE_Z / SIZE + WORLD_RADIUS + 0.5) * cell;
    ctx.fillStyle = '#ff7733';
    ctx.fillRect(vx - cell * 0.45, vy - cell * 0.45, cell * 0.9, cell * 0.9);

    // Custom Waypoint Marker
    if (this.customWaypoint) {
      const wpx = mapOriginX + (this.customWaypoint.x / SIZE + WORLD_RADIUS + 0.5) * cell;
      const wpy = mapOriginY + (this.customWaypoint.z / SIZE + WORLD_RADIUS + 0.5) * cell;
      ctx.fillStyle = '#22ddff';
      ctx.beginPath();
      ctx.arc(wpx, wpy, Math.max(5, cell * 0.45), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Wildlife markers
    for (const a of animals) {
      const ax = mapOriginX + (a.x / SIZE + WORLD_RADIUS + 0.5) * cell;
      const ay = mapOriginY + (a.z / SIZE + WORLD_RADIUS + 0.5) * cell;
      ctx.fillStyle = speciesColor(a.species);
      ctx.beginPath();
      ctx.arc(ax, ay, Math.max(2.5, cell * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }

    // Player position and LOOK ARROW
    // dirX = sin(camYaw), dirZ = cos(camYaw)
    // On screen, x increases right, y increases down (+Z is down)
    // Arrow geometry points UP by default: rotate angle = atan2(dirX, -dirZ)
    const px = mapOriginX + (playerPos.x / SIZE + WORLD_RADIUS + 0.5) * cell;
    const py = mapOriginY + (playerPos.z / SIZE + WORLD_RADIUS + 0.5) * cell;
    const lookAngle = Math.atan2(Math.sin(camYaw), -Math.cos(camYaw));

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(lookAngle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-6, 7);
    ctx.lineTo(0, 3.8);
    ctx.lineTo(6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }
}
