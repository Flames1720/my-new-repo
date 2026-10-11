/** Preview-only tactical opponent. Decisions use sight, remembered motion and audible reloads. */
export const HUNTER_PREVIEW = true;
export type HunterTactic = 'stalk' | 'flank' | 'dodge' | 'rush' | 'recover' | 'search';
export interface HunterObservation {
  dt: number; x: number; z: number; playerX: number; playerZ: number;
  visible: boolean; noiseAudible?: boolean; aimedAt: boolean; shotVisible: boolean; reloadAudible: boolean;
  hpFraction: number; canMove: (x: number, z: number) => boolean;
  covered: (x: number, z: number) => boolean;
}
export class HunterBrain {
  tactic: HunterTactic = 'stalk';
  targetX = 0; targetZ = 0;
  speed = 4.45;
  private think = 0;
  private memory = 0;
  private lastX = 0; private lastZ = 0;
  private vx = 0; private vz = 0;
  private observed = false;
  private dodgeCooldown = 0;
  private dodgeTime = 0;
  private aimExposure = 0;
  private side = 1;
  private lastPlayerX = 0; private lastPlayerZ = 0;
  private strafeBias = 0;
  private attackRecovery = 0;
  private previousX = 0; private previousZ = 0;
  private stuck = 0;
  private elapsed = 0;
  attacked(): void { this.attackRecovery = .65; }
  update(o: HunterObservation): void {
    const dt = Math.min(.25, Math.max(0, o.dt));
    this.elapsed += dt;
    this.think -= dt; this.memory = Math.max(0, this.memory-dt);
    this.dodgeCooldown = Math.max(0,this.dodgeCooldown-dt);
    this.dodgeTime = Math.max(0,this.dodgeTime-dt);
    this.attackRecovery = Math.max(0,this.attackRecovery-dt);
    if (o.visible) {
      if (this.observed) {
        const vx = (o.playerX-this.lastPlayerX)/Math.max(.001,dt), vz = (o.playerZ-this.lastPlayerZ)/Math.max(.001,dt);
        // Discontinuities are not meaningful motion predictions.
        this.vx = this.vx*.75 + Math.max(-7,Math.min(7,vx))*.25;
        this.vz = this.vz*.75 + Math.max(-7,Math.min(7,vz))*.25;
        const dx=o.playerX-o.x,dz=o.playerZ-o.z;
        this.strafeBias = this.strafeBias*.97 + Math.sign(dx*this.vz-dz*this.vx)*.03;
      }
      this.lastX=o.playerX;this.lastZ=o.playerZ;this.lastPlayerX=o.playerX;this.lastPlayerZ=o.playerZ;
      this.observed=true;this.memory=5;
    } else {
      this.observed=false;
      if(o.noiseAudible){
        // Footsteps give an approximate search area, not vision through walls.
        this.lastX=Math.round(o.playerX/3)*3;this.lastZ=Math.round(o.playerZ/3)*3;
        this.vx=this.vz=0;this.memory=3;
      }
    }
    this.aimExposure=o.visible && o.aimedAt ? this.aimExposure+dt : 0;
    if (o.visible && o.aimedAt && (this.aimExposure>.18 || o.shotVisible) && this.dodgeCooldown===0) {
      // React to a sustained aim/muzzle flash; never cancel damage or teleport.
      this.side = Math.abs(this.strafeBias)>.25 ? -Math.sign(this.strafeBias) : -this.side;
      this.dodgeTime=.32;this.dodgeCooldown=1.15;this.think=0;
    }
    if (this.think>0) return;
    this.think=.12;
    const targetX=this.lastX+this.vx*.55,targetZ=this.lastZ+this.vz*.55;
    let dx=targetX-o.x,dz=targetZ-o.z;const dist=Math.max(.01,Math.hypot(dx,dz));dx/=dist;dz/=dist;
    this.speed=4.45;
    if (!this.memory) { this.tactic='search';this.targetX=o.x+Math.cos(this.elapsed*.45)*3;this.targetZ=o.z+Math.sin(this.elapsed*.45)*3;return; }
    const moved=Math.hypot(o.x-this.previousX,o.z-this.previousZ);
    this.stuck=moved<.06 ? this.stuck+.12 : 0;this.previousX=o.x;this.previousZ=o.z;
    if(this.stuck>.6){this.side=-this.side;this.stuck=0;}
    if(this.dodgeTime>0){this.tactic='dodge';this.speed=7;this.targetX=o.x-dz*this.side*3;this.targetZ=o.z+dx*this.side*3;}
    else if(this.attackRecovery>0){this.tactic='recover';this.targetX=o.x-dx*2-dz*this.side*2;this.targetZ=o.z-dz*2+dx*this.side*2;}
    else if(o.visible && o.reloadAudible){this.tactic='rush';this.targetX=targetX;this.targetZ=targetZ;}
    else if(!o.visible){this.tactic='search';this.targetX=this.lastX;this.targetZ=this.lastZ;}
    else if(dist<2.8){this.tactic='rush';this.targetX=targetX;this.targetZ=targetZ;}
    else {this.tactic='flank';this.targetX=targetX-dz*this.side*3.8;this.targetZ=targetZ+dx*this.side*3.8;}
    // Evaluate a small fan: avoid blocked routes and prefer actual occlusion when threatened.
    const goalAngle=Math.atan2(this.targetZ-o.z,this.targetX-o.x);
    let best=-Infinity,bx=o.x,bz=o.z;
    const seekCover=o.visible && !o.reloadAudible && (o.aimedAt || o.hpFraction<.45) && dist>3;
    let coverQueries=0;
    for(const offset of [0,this.side*.65,-this.side*.65,this.side*1.25,-this.side*1.25,this.side*1.9,-this.side*1.9,Math.PI]){
      const angle=goalAngle+offset,x=o.x+Math.cos(angle)*2,z=o.z+Math.sin(angle)*2;
      if(!o.canMove(o.x+(x-o.x)*.5,o.z+(z-o.z)*.5)||!o.canMove(x,z))continue;
      const score=-Math.hypot(x-this.targetX,z-this.targetZ)+(seekCover&&coverQueries++<3&&o.covered(x,z)?7:0)-Math.abs(offset)*.15;
      if(score>best){best=score;bx=x;bz=z;}
    }
    this.targetX=bx;this.targetZ=bz;
    if(best===-Infinity)this.speed=0;
  }
}
