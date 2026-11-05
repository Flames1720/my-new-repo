/**
 * Self-contained Arena FPS mode.
 * Own canvas overlay so we do not fight the open-world main loop.
 * Supports solo bots + Supabase Realtime rooms for friends.
 */
import * as THREE from 'three';
import { ArenaMap } from './arena-map';
import { MultiplayerRoom } from '../multiplayer/room';
import type { PlayerState, NetEvent } from '../multiplayer/types';

type Bot = {
  id: string;
  mesh: THREE.Group;
  health: number;
  yaw: number;
  speed: number;
  nextShot: number;
  alive: boolean;
};

export class ArenaMode {
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private map: ArenaMap;
  private clock = new THREE.Clock();
  private running = false;
  private raf = 0;

  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private velocity = new THREE.Vector3();
  private onGround = true;
  private health = 100;
  private kills = 0;
  private weapon = 0;
  private ammo = [15, 6, 30];
  private reserve = [60, 24, 90];
  private fireCooldown = 0;
  private reloading = false;
  private reloadTimer = 0;

  private bots: Bot[] = [];
  private remoteMeshes = new Map<string, THREE.Group>();
  private room: MultiplayerRoom | null = null;
  private localId = crypto.randomUUID();
  private stateSendAccum = 0;

  private hudHp!: HTMLElement;
  private hudAmmo!: HTMLElement;
  private hudKills!: HTMLElement;
  private hudStatus!: HTMLElement;
  private roomCodeEl!: HTMLElement;

  onExit: () => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'arenaModeRoot';
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '100000',
      background: '#0a1210',
      display: 'none',
      flexDirection: 'column',
    } as CSSStyleDeclaration);

    this.canvas = document.createElement('canvas');
    this.canvas.style.flex = '1';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.root.appendChild(this.canvas);

    const hud = document.createElement('div');
    hud.innerHTML = `
      <div style="position:absolute;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#edf3eb">
        <div style="position:absolute;top:12px;left:14px;display:flex;gap:14px;align-items:center">
          <div style="background:#0d1614cc;border:1px solid #456351;padding:8px 12px;border-radius:4px">
            <div style="font-size:9px;letter-spacing:.16em;color:#83bd95">HP</div>
            <div id="arenaHp" style="font-weight:900;font-size:18px">100</div>
          </div>
          <div style="background:#0d1614cc;border:1px solid #456351;padding:8px 12px;border-radius:4px">
            <div style="font-size:9px;letter-spacing:.16em;color:#83bd95">AMMO</div>
            <div id="arenaAmmo" style="font-weight:900;font-size:18px">15 / 60</div>
          </div>
          <div style="background:#0d1614cc;border:1px solid #456351;padding:8px 12px;border-radius:4px">
            <div style="font-size:9px;letter-spacing:.16em;color:#83bd95">KILLS</div>
            <div id="arenaKills" style="font-weight:900;font-size:18px">0</div>
          </div>
        </div>
        <div style="position:absolute;top:12px;right:14px;text-align:right;pointer-events:auto">
          <div id="arenaRoomCode" style="font-size:11px;letter-spacing:.12em;color:#83bd95;margin-bottom:6px">SOLO</div>
          <button id="arenaExitBtn" type="button" style="pointer-events:auto;padding:8px 14px;border:1px solid #79c591;background:#1d7548;color:#effff1;font:900 10px system-ui;letter-spacing:.14em;border-radius:3px 10px;cursor:pointer">EXIT ARENA</button>
        </div>
        <div id="arenaStatus" style="position:absolute;bottom:18px;left:50%;transform:translateX(-50%);font-size:12px;letter-spacing:.08em;color:#b5c5ba;background:#0d1614aa;padding:6px 12px;border-radius:4px">Click to lock mouse · WASD move · LMB shoot · R reload · 1/2/3 weapons</div>
        <div style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#effff1;box-shadow:0 0 0 1px #0008"></div>
      </div>
    `;
    this.root.appendChild(hud);
    document.body.appendChild(this.root);

    this.hudHp = this.root.querySelector('#arenaHp')!;
    this.hudAmmo = this.root.querySelector('#arenaAmmo')!;
    this.hudKills = this.root.querySelector('#arenaKills')!;
    this.hudStatus = this.root.querySelector('#arenaStatus')!;
    this.roomCodeEl = this.root.querySelector('#arenaRoomCode')!;
    this.root.querySelector('#arenaExitBtn')!.addEventListener('click', () => this.stop());

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87a0b8);
    this.scene.fog = new THREE.Fog(0x87a0b8, 40, 90);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 200);

    const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x8899aa, 0.45));

    this.map = new ArenaMap();
    this.scene.add(this.map.group);

    this.bindInput();
  }

  private bindInput() {
    window.addEventListener('keydown', (e) => {
      if (!this.running) return;
      this.keys.add(e.code);
      if (e.code === 'Digit1') this.weapon = 0;
      if (e.code === 'Digit2') this.weapon = 1;
      if (e.code === 'Digit3') this.weapon = 2;
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'Escape') this.canvas.ownerDocument.exitPointerLock();
      this.updateAmmoHud();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    this.canvas.addEventListener('click', () => {
      if (this.running) this.canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvas) {
        this.hudStatus.textContent = 'WASD · LMB shoot · R reload · 1/2/3 weapons · ESC unlock';
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.running || document.pointerLockElement !== this.canvas) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.running || e.button !== 0) return;
      if (document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
        return;
      }
      this.tryShoot();
    });

    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    if (!this.running) return;
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private spawnPlayer() {
    const s = this.map.getSpawn(Math.floor(Math.random() * this.map.spawns.length));
    this.camera.position.set(s.x, 1.6, s.z);
    this.yaw = s.yaw;
    this.pitch = 0;
    this.velocity.set(0, 0, 0);
    this.health = 100;
    this.ammo = [15, 6, 30];
    this.reserve = [60, 24, 90];
    this.updateAmmoHud();
    this.hudHp.textContent = String(this.health);
  }

  private makeBotMesh(color = 0xb85c4a) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
    );
    body.position.y = 1.0;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.75 }),
    );
    head.position.y = 1.75;
    g.add(head);
    return g;
  }

  private spawnBots(count = 4) {
    for (const b of this.bots) this.scene.remove(b.mesh);
    this.bots = [];
    for (let i = 0; i < count; i++) {
      const s = this.map.getSpawn((i + 2) % this.map.spawns.length);
      const mesh = this.makeBotMesh();
      mesh.position.set(s.x, 0, s.z);
      this.scene.add(mesh);
      this.bots.push({
        id: `bot-${i}`,
        mesh,
        health: 80,
        yaw: s.yaw,
        speed: 3.2 + Math.random() * 1.2,
        nextShot: 1 + Math.random() * 2,
        alive: true,
      });
    }
  }

  private startReload() {
    if (this.reloading) return;
    const need = [15, 6, 30][this.weapon] - this.ammo[this.weapon];
    if (need <= 0 || this.reserve[this.weapon] <= 0) return;
    this.reloading = true;
    this.reloadTimer = this.weapon === 1 ? 1.6 : 1.1;
    this.hudStatus.textContent = 'RELOADING…';
  }

  private tryShoot() {
    if (this.reloading || this.fireCooldown > 0 || this.health <= 0) return;
    if (this.ammo[this.weapon] <= 0) {
      this.startReload();
      return;
    }
    this.ammo[this.weapon]--;
    this.fireCooldown = this.weapon === 0 ? 0.28 : this.weapon === 1 ? 0.7 : 0.09;
    this.updateAmmoHud();

    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

    const ray = new THREE.Raycaster(origin, dir, 0, 80);
    const targets = this.bots.filter((b) => b.alive).map((b) => b.mesh);
    const hits = ray.intersectObjects(targets, true);
    if (hits.length) {
      let obj: THREE.Object3D | null = hits[0].object;
      let matched: Bot | undefined;
      while (obj) {
        matched = this.bots.find((b) => b.mesh === obj);
        if (matched) break;
        obj = obj.parent;
      }
      if (matched && matched.alive) {
        const dmg = this.weapon === 0 ? 28 : this.weapon === 1 ? 55 : 18;
        matched.health -= dmg;
        if (matched.health <= 0) {
          matched.alive = false;
          matched.mesh.visible = false;
          this.kills++;
          this.hudKills.textContent = String(this.kills);
        }
      }
    }

    this.room?.sendEvent({
      type: 'shoot',
      id: this.localId,
      origin: [origin.x, origin.y, origin.z],
      direction: [dir.x, dir.y, dir.z],
      weapon: this.weapon,
      t: Date.now(),
    });
  }

  private updateAmmoHud() {
    const names = ['P9', 'W-870', 'AR-15'];
    this.hudAmmo.textContent = `${names[this.weapon]}  ${this.ammo[this.weapon]} / ${this.reserve[this.weapon]}`;
  }

  private updateBots(dt: number) {
    const playerPos = this.camera.position;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const toPlayer = new THREE.Vector3().subVectors(playerPos, bot.mesh.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      if (dist > 0.5) {
        toPlayer.normalize();
        bot.mesh.position.addScaledVector(toPlayer, bot.speed * dt);
        bot.yaw = Math.atan2(toPlayer.x, toPlayer.z);
        bot.mesh.rotation.y = bot.yaw;
        this.map.resolveCollision(bot.mesh.position, 0.4, 1.7);
      }
      bot.nextShot -= dt;
      if (bot.nextShot <= 0 && dist < 35) {
        bot.nextShot = 0.9 + Math.random() * 1.2;
        if (dist < 28 && Math.random() < 0.45) {
          this.health = Math.max(0, this.health - (8 + Math.random() * 10));
          this.hudHp.textContent = String(Math.round(this.health));
          if (this.health <= 0) {
            this.hudStatus.textContent = 'YOU DIED · respawning';
            setTimeout(() => this.spawnPlayer(), 1800);
          }
        }
      }
    }
  }

  private updatePlayer(dt: number) {
    const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 9.5 : 6.2;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) wish.add(forward);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) wish.sub(forward);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) wish.add(right);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, wish.x, 12, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, wish.z, 12, dt);

    if ((this.keys.has('Space') || this.keys.has('Spacebar')) && this.onGround) {
      this.velocity.y = 7.5;
      this.onGround = false;
    }
    this.velocity.y -= 22 * dt;

    const pos = this.camera.position;
    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;
    pos.y += this.velocity.y * dt;

    if (pos.y <= 1.6) {
      pos.y = 1.6;
      this.velocity.y = 0;
      this.onGround = true;
    }
    this.map.resolveCollision(pos, 0.35, 1.6);

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const cap = [15, 6, 30][this.weapon];
        const need = cap - this.ammo[this.weapon];
        const take = Math.min(need, this.reserve[this.weapon]);
        this.ammo[this.weapon] += take;
        this.reserve[this.weapon] -= take;
        this.reloading = false;
        this.updateAmmoHud();
        this.hudStatus.textContent = 'WASD · LMB shoot · R reload · 1/2/3 weapons';
      }
    }
  }

  private syncNetwork(dt: number) {
    if (!this.room?.isConnected) return;
    this.stateSendAccum += dt;
    if (this.stateSendAccum < 1 / 18) return;
    this.stateSendAccum = 0;
    this.room.sendState({
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
      health: this.health,
      weapon: this.weapon,
      anim: this.velocity.length() > 1 ? 'run' : 'idle',
    });
  }

  private onRemoteState(state: PlayerState) {
    let mesh = this.remoteMeshes.get(state.id);
    if (!mesh) {
      mesh = this.makeBotMesh(0x4a7ab8);
      this.scene.add(mesh);
      this.remoteMeshes.set(state.id, mesh);
    }
    mesh.position.set(state.x, 0, state.z);
    mesh.rotation.y = state.yaw;
    mesh.visible = state.health > 0;
  }

  private onNetEvent(_event: NetEvent) {}

  private loop = () => {
    if (!this.running) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    this.updatePlayer(dt);
    this.updateBots(dt);
    this.syncNetwork(dt);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  startSolo(botCount = 4) {
    this.room?.leave();
    this.room = null;
    this.roomCodeEl.textContent = 'SOLO · BOTS';
    this.begin(botCount);
  }

  async startCreateRoom(name = 'Player') {
    this.room = new MultiplayerRoom(this.localId, name);
    this.room.onState = (s) => this.onRemoteState(s);
    this.room.onEvent = (e) => this.onNetEvent(e);
    this.room.onStatus = (s) => {
      this.hudStatus.textContent = s;
    };
    this.room.onPresenceSync = (players) => {
      this.roomCodeEl.textContent = `ROOM ${this.room?.roomInfo?.code || '?'} · ${players.length} ONLINE`;
    };
    const code = await this.room.create(8);
    if (!code) {
      this.hudStatus.textContent = 'Could not create room (check Supabase config)';
      this.room = null;
      return null;
    }
    this.roomCodeEl.textContent = `ROOM ${code} · SHARE THIS CODE`;
    this.begin(2);
    return code;
  }

  async startJoinRoom(code: string, name = 'Player') {
    this.room = new MultiplayerRoom(this.localId, name);
    this.room.onState = (s) => this.onRemoteState(s);
    this.room.onEvent = (e) => this.onNetEvent(e);
    this.room.onStatus = (s) => {
      this.hudStatus.textContent = s;
    };
    this.room.onPresenceSync = (players) => {
      this.roomCodeEl.textContent = `ROOM ${this.room?.roomInfo?.code || code} · ${players.length} ONLINE`;
    };
    const joined = await this.room.join(code);
    if (!joined) {
      this.hudStatus.textContent = 'Could not join room';
      this.room = null;
      return false;
    }
    this.roomCodeEl.textContent = `ROOM ${joined}`;
    this.begin(2);
    return true;
  }

  private begin(botCount: number) {
    this.running = true;
    this.root.style.display = 'flex';
    this.kills = 0;
    this.hudKills.textContent = '0';
    this.spawnPlayer();
    this.spawnBots(botCount);
    this.resize();
    this.clock.start();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    this.canvas.requestPointerLock();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.exitPointerLock();
    void this.room?.leave();
    this.room = null;
    this.root.style.display = 'none';
    this.onExit();
  }

  get isActive() {
    return this.running;
  }
}
