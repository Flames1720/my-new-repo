import * as THREE from 'three';
import type { ArenaMap } from './arena-map';
export interface ArenaBot { mesh:THREE.Group; speed:number; yaw:number; strafe:number; strafeTime:number; nextShot:number; aimTime:number; hitFlash:number; health:number; alive:boolean; id:string; }
export class ArenaBotBrain {
 private ray=new THREE.Raycaster(); private blockers:THREE.Object3D[];
 constructor(private map:ArenaMap){this.blockers=map.group.children.filter(o=>o instanceof THREE.Mesh)}
 update(b:ArenaBot,p:THREE.Vector3,pv:THREE.Vector3,dt:number):number {
  if(!b.alive)return 0; const to=new THREE.Vector3(p.x-b.mesh.position.x,0,p.z-b.mesh.position.z),d=to.length();if(d<.01)return 0;const dir=to.normalize(),side=new THREE.Vector3(dir.z,0,-dir.x);
  b.strafeTime-=dt;if(b.strafeTime<=0){b.strafe=Math.random()<.5?-1:1;b.strafeTime=.8+Math.random()*1.4}
  const preferred=12+(b.id.charCodeAt(b.id.length-1)%5);let f=d>preferred+4?1:d<preferred-4?-.6:0;if(d>34)f=1;
  const move=dir.multiplyScalar(f).add(side.multiplyScalar(b.strafe*.72));if(move.lengthSq()>.01){move.normalize();b.mesh.position.addScaledVector(move,b.speed*dt);this.map.resolveCollision(b.mesh.position,.42,1.8)}
  const origin=b.mesh.position.clone().add(new THREE.Vector3(0,1.4,0)),aim=new THREE.Vector3(p.x-origin.x,p.y-.2-origin.y,p.z-origin.z);let yaw=Math.atan2(aim.x,aim.z),delta=Math.atan2(Math.sin(yaw-b.yaw),Math.cos(yaw-b.yaw));b.yaw+=delta*Math.min(1,dt*5.5);b.mesh.rotation.y=b.yaw;
  this.ray.set(origin,aim.normalize());this.ray.far=Math.max(0,d-1);if(this.ray.intersectObjects(this.blockers,false).length)return 0;
  b.aimTime=Math.max(0,b.aimTime-dt);b.nextShot-=dt;if(d>32||b.nextShot>0)return 0;
  if(b.aimTime<=0){b.aimTime=.28+Math.random()*.25;b.nextShot=b.aimTime;return 0}
  b.aimTime=0;b.nextShot=.16+Math.random()*.2;const accuracy=THREE.MathUtils.clamp(.67-d*.01-Math.min(.2,pv.length()*.025),.2,.62);return Math.random()<accuracy?5+Math.random()*4:0;
 }
}