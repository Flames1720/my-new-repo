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
} from './terrain';
import type { AnimalMarker, BreadcrumbPoint, Waypoint } from './types';
import { speciesColor } from './fauna';

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
      if (d < 1.4) return; // Haven't moved significantly
    }

    this.trail.push({ x, z, time: Date.now() });
    if (this.trail.length > 300) {
      this.trail.shift();
    }
    this.lastTrailRecordTime = now;

    // Periodic persist
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
    const gridZ = WORLD_RADIUS - (clickY - mapOriginY) / cell;

    const worldX = Math.round(gridX * SIZE);
    const worldZ = Math.round(gridZ * SIZE);

    if (Math.abs(gridX) <= WORLD_RADIUS && Math.abs(gridZ) <= WORLD_RADIUS) {
      // Toggle waypoint
      if (this.customWaypoint && Math.hypot(this.customWaypoint.x - worldX, this.customWaypoint.z - worldZ) < 12) {
        this.customWaypoint = null;
      } else {
        this.customWaypoint = { x: worldX, z: worldZ, label: `Beacon (${worldX}, ${worldZ})` };
      }
      try {
        localStorage.setItem('world_waypoint_v1', JSON.stringify(this.customWaypoint));
      } catch {}
    }
  }

  // --- RENDER LIVE CODM-STYLE RADAR MINI-MAP ---
  renderMini(playerPos: THREE.Vector3, playerYaw: number, animals: AnimalMarker[]): void {
    const c = this.miniCanvas;
    const ctx = this.miniCtx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = (c.width = c.clientWidth * dpr);
    const h = (c.height = c.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const size = c.clientWidth;
    const radius = size / 2;
    const cx = radius;
    const cy = radius;

    ctx.clearRect(0, 0, size, size);

    // Circular radar clipping mask
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
    ctx.clip();

    // Radar backdrop
    ctx.fillStyle = '#111820f0';
    ctx.fillRect(0, 0, size, size);

    // Local radar scale: view radius of ~55 meters
    const viewRange = 55;
    const scale = (radius - 8) / viewRange;

    // Rotate radar with player yaw for CODM-style navigation
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(playerYaw);

    // Draw local terrain tiles
    const chunkMinX = Math.floor((playerPos.x - viewRange) / SIZE);
    const chunkMaxX = Math.ceil((playerPos.x + viewRange) / SIZE);
    const chunkMinZ = Math.floor((playerPos.z - viewRange) / SIZE);
    const chunkMaxZ = Math.ceil((playerPos.z + viewRange) / SIZE);

    for (let gx = chunkMinX; gx <= chunkMaxX; gx++) {
      for (let gz = chunkMinZ; gz <= chunkMaxZ; gz++) {
        const wx = gx * SIZE + SIZE / 2;
        const wz = gz * SIZE + SIZE / 2;
        const dx = wx - playerPos.x;
        const dz = wz - playerPos.z;

        // Skip if outside circle view
        if (Math.hypot(dx, dz) > viewRange + SIZE) continue;

        const isWater = waterAt(wx, wz);
        const isRoad = roadAt(wx, wz);
        const isMtn = mountainMaskAt(wx, wz) > 0.4;
        const isRiver = isRiverAt(wx, wz);

        ctx.fillStyle = isWater || isRiver ? '#3b7899' : isRoad ? '#555b62' : isMtn ? '#767472' : '#4d6945';
        ctx.fillRect((dx - SIZE / 2) * scale, (dz - SIZE / 2) * scale, SIZE * scale + 0.6, SIZE * scale + 0.6);
      }
    }

    // --- DRAW DISPLACEMENT TRAILS (BREADCRUMBS) ---
    if (this.trail.length > 1) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < this.trail.length; i++) {
        const pt = this.trail[i];
        const tx = (pt.x - playerPos.x) * scale;
        const tz = (pt.z - playerPos.z) * scale;
        if (!started) {
          ctx.moveTo(tx, tz);
          started = true;
        } else {
          ctx.lineTo(tx, tz);
        }
      }
      ctx.strokeStyle = '#5de6ffbb';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Home Icon on Radar
    const homeDx = (HOME_X - playerPos.x) * scale;
    const homeDz = (HOME_Z - playerPos.z) * scale;
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(homeDx, homeDz, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw Village on Radar
    const vDx = (VILLAGE_X - playerPos.x) * scale;
    const vDz = (VILLAGE_Z - playerPos.z) * scale;
    ctx.fillStyle = '#ff7744';
    ctx.beginPath();
    ctx.arc(vDx, vDz, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw Waypoint on Radar
    if (this.customWaypoint) {
      const wpDx = (this.customWaypoint.x - playerPos.x) * scale;
      const wpDz = (this.customWaypoint.z - playerPos.z) * scale;
      ctx.fillStyle = '#33ccff';
      ctx.beginPath();
      ctx.arc(wpDx, wpDz, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nearby Animals as radar blips
    for (const a of animals) {
      const adx = (a.x - playerPos.x) * scale;
      const adz = (a.z - playerPos.z) * scale;
      if (Math.hypot(adx, adz) < radius - 8) {
        ctx.fillStyle = speciesColor(a.species);
        ctx.beginPath();
        ctx.arc(adx, adz, a.isBaby ? 2.2 : 3.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore(); // Undo radar rotation

    // Radar Rings & Crosshairs
    ctx.strokeStyle = '#ffffff25';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, (radius - 8) * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 8, 0, Math.PI * 2);
    ctx.stroke();

    // Center Player Arrowhead (Always pointing UP on radar)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx - 5, cy + 6);
    ctx.lineTo(cx, cy + 3.5);
    ctx.lineTo(cx + 5, cy + 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0b1015';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // North Needle on Outer Edge
    const northAngle = playerYaw;
    const nx = cx + Math.sin(northAngle) * (radius - 8);
    const ny = cy - Math.cos(northAngle) * (radius - 8);
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);

    ctx.restore(); // End clipping

    // Outer Radar Frame & Glow
    ctx.strokeStyle = '#38d2ff88';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- RENDER FULL WORLD MAP ---
  renderFull(playerPos: THREE.Vector3, playerYaw: number, animals: AnimalMarker[]): void {
    if (!this.isFullOpen) return;

    const c = this.fullCanvas;
    const ctx = this.fullCtx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cw = c.clientWidth;
    const ch = c.clientHeight;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#10161d';
    ctx.fillRect(0, 0, cw, ch);

    const pad = 18;
    const cell = Math.min((cw - pad * 2) / WORLD_DIAMETER, (ch - pad * 2) / WORLD_DIAMETER);
    const mapOriginX = pad;
    const mapOriginY = pad;

    // Render world grid cells
    for (let cz = -WORLD_RADIUS; cz <= WORLD_RADIUS; cz++) {
      for (let cx = -WORLD_RADIUS; cx <= WORLD_RADIUS; cx++) {
        const sx = mapOriginX + (cx + WORLD_RADIUS) * cell;
        const sy = mapOriginY + (WORLD_RADIUS - cz) * cell;
        const wx = cx * SIZE + SIZE / 2;
        const wz = cz * SIZE + SIZE / 2;

        const isWater = waterAt(wx, wz);
        const isRoad = roadAt(wx, wz);
        const isMtn = mountainMaskAt(wx, wz) > 0.4;
        const isRiver = isRiverAt(wx, wz);

        ctx.fillStyle = isWater || isRiver ? '#3b7899' : isRoad ? '#555b62' : isMtn ? '#7b7976' : '#527248';
        ctx.fillRect(sx, sy, Math.ceil(cell) + 0.5, Math.ceil(cell) + 0.5);
      }
    }

    // --- FULL EXPLORATION DISPLACEMENT TRAILS ---
    if (this.trail.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < this.trail.length; i++) {
        const pt = this.trail[i];
        const tx = mapOriginX + (pt.x / SIZE + WORLD_RADIUS + 0.5) * cell;
        const ty = mapOriginY + (WORLD_RADIUS - pt.z / SIZE + 0.5) * cell;
        if (i === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.strokeStyle = '#42e4ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Dotted point highlights
      for (let i = 0; i < this.trail.length; i += 8) {
        const pt = this.trail[i];
        const tx = mapOriginX + (pt.x / SIZE + WORLD_RADIUS + 0.5) * cell;
        const ty = mapOriginY + (WORLD_RADIUS - pt.z / SIZE + 0.5) * cell;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tx, ty, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Home Badge
    const hx = mapOriginX + (HOME_X / SIZE + WORLD_RADIUS + 0.5) * cell;
    const hy = mapOriginY + (WORLD_RADIUS - HOME_Z / SIZE + 0.5) * cell;
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(hx - cell * 0.4, hy - cell * 0.4, cell * 0.8, cell * 0.8);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(hx - cell * 0.4, hy - cell * 0.4, cell * 0.8, cell * 0.8);

    // Village Badge
    const vx = mapOriginX + (VILLAGE_X / SIZE + WORLD_RADIUS + 0.5) * cell;
    const vy = mapOriginY + (WORLD_RADIUS - VILLAGE_Z / SIZE + 0.5) * cell;
    ctx.fillStyle = '#ff7733';
    ctx.fillRect(vx - cell * 0.4, vy - cell * 0.4, cell * 0.8, cell * 0.8);

    // Custom Waypoint Marker
    if (this.customWaypoint) {
      const wpx = mapOriginX + (this.customWaypoint.x / SIZE + WORLD_RADIUS + 0.5) * cell;
      const wpy = mapOriginY + (WORLD_RADIUS - this.customWaypoint.z / SIZE + 0.5) * cell;
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
      const ay = mapOriginY + (WORLD_RADIUS - a.z / SIZE + 0.5) * cell;
      ctx.fillStyle = speciesColor(a.species);
      ctx.beginPath();
      ctx.arc(ax, ay, Math.max(2.5, cell * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }

    // Player indicator with heading arrow
    const px = mapOriginX + (playerPos.x / SIZE + WORLD_RADIUS + 0.5) * cell;
    const py = mapOriginY + (WORLD_RADIUS - playerPos.z / SIZE + 0.5) * cell;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(playerYaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-5, 6);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // Map Border
    ctx.strokeStyle = '#ffffff44';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, WORLD_DIAMETER * cell, WORLD_DIAMETER * cell);
  }
}
