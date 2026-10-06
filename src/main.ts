import * as THREE from 'three';
import './style.css';

type Mode='tpp'|'fpp';
type Save={version:1;player:{x:number;y:number;z:number;ry:number;mode:Mode};camera:{yaw:number;pitch:number;distance:number};changes:Record<string,string[]>;inventory:Record<string,number>};
const SAVE_KEY='virtual-family-core-v1',SEED=847231,SIZE=16,RADIUS=7,WORLD_RADIUS=18;
const WORLD_DIAMETER=WORLD_RADIUS*2+1;
const WATER_LEVEL=1.25,ROAD_SPACING=128,ROAD_WIDTH=5.5;
const HOME_X=8,HOME_Z=8,HOME_FLATTEN_RADIUS=6.5;
const rawTerrainHeightAt=(x:number,z:number)=>{const broad=Math.sin(x*.018+SEED*.001)*1.7+Math.cos(z*.021-SEED*.0007)*1.35;const hills=Math.sin((x+z)*.045)*.75+Math.cos((x-z)*.032)*.55;return Math.max(0,broad+hills+.9)};
const HOME_BASE_HEIGHT=rawTerrainHeightAt(HOME_X,HOME_Z);
const terrainHeightAt=(x:number,z:number)=>{const raw=rawTerrainHeightAt(x,z);const d=Math.hypot(x-HOME_X,z-HOME_Z);if(d<HOME_FLATTEN_RADIUS){const t=1-d/HOME_FLATTEN_RADIUS;return raw+(HOME_BASE_HEIGHT-raw)*t}return raw};
const waterAt=(x:number,z:number)=>{const a=Math.sin(x*.011+z*.017+SEED*.00003),b=Math.cos(x*.019-z*.009-SEED*.00002);return a+b>1.72&&terrainHeightAt(x,z)<WATER_LEVEL};
const roadAt=(x:number,z:number)=>{const mx=Math.abs((((x+ROAD_SPACING/2)%ROAD_SPACING)+ROAD_SPACING)%ROAD_SPACING-ROAD_SPACING/2),mz=Math.abs((((z+ROAD_SPACING/2)%ROAD_SPACING)+ROAD_SPACING)%ROAD_SPACING-ROAD_SPACING/2);return mx<ROAD_WIDTH/2||mz<ROAD_WIDTH/2};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const angleLerp=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*Math.min(1,t);
const hash=(x:number,z:number)=>{let n=Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(SEED,1442695041);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296};

// --- Resource model: every harvestable thing is data, not a special case ---
type ResourceKind='oak'|'pine'|'fruit'|'palm';
interface ResourceDef{hitsToFell:number;regrowSeconds:number;colliderRadius:number;yieldItem:string;yieldQty:[number,number];bonusItem?:string;bonusQty?:[number,number];trunkColor:number;crownColor:number;fruitColor?:number}
const RESOURCE_DEFS:Record<ResourceKind,ResourceDef>={
 oak:{hitsToFell:3,regrowSeconds:180,colliderRadius:.72,yieldItem:'Wood',yieldQty:[2,4],trunkColor:0x694b35,crownColor:0x3d7148},
 pine:{hitsToFell:2,regrowSeconds:140,colliderRadius:.6,yieldItem:'Pine Wood',yieldQty:[1,3],trunkColor:0x5b4330,crownColor:0x2e5c3e},
 fruit:{hitsToFell:4,regrowSeconds:220,colliderRadius:.72,yieldItem:'Wood',yieldQty:[1,3],bonusItem:'Fruit',bonusQty:[2,5],trunkColor:0x6b4a32,crownColor:0x4a7a3f,fruitColor:0xcc4433},
 palm:{hitsToFell:3,regrowSeconds:200,colliderRadius:.55,yieldItem:'Palm Wood',yieldQty:[1,2],trunkColor:0x8a6a3f,crownColor:0x4f8a3d}
};
const ITEM_ICONS:Record<string,string>={Wood:'🪵','Pine Wood':'🪵','Palm Wood':'🪵',Fruit:'🍎'};
function pickTreeKind(cx:number,cz:number,i:number,tx:number,tz:number):ResourceKind{
 const nearShore=waterAt(tx+3,tz)||waterAt(tx-3,tz)||waterAt(tx,tz+3)||waterAt(tx,tz-3);
 if(nearShore)return 'palm';
 const pineChunk=hash(cx*31+7,cz*37-7)<.35; // whole chunks lean pine, so they read as clusters
 const roll=hash(cx*53+i*11,cz*59-i*13);
 if(pineChunk)return roll<.82?'pine':(roll<.92?'fruit':'oak');
 return roll<.14?'fruit':(roll<.22?'pine':'oak');
}
function buildTree(kind:ResourceKind,lod:number):THREE.Group{
 const g=new THREE.Group();const def=RESOURCE_DEFS[kind];
 const trunkMat=new THREE.MeshStandardMaterial({color:def.trunkColor}),crownMat=new THREE.MeshStandardMaterial({color:def.crownColor});
 if(kind==='palm'){
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,2.6,lod===0?8:5),trunkMat);trunk.position.y=1.3;g.add(trunk);
  for(let f=0;f<5;f++){const frond=new THREE.Mesh(new THREE.ConeGeometry(.22,1.6,4),crownMat);const a=f*(Math.PI*2/5);frond.position.set(Math.cos(a)*.5,2.6,Math.sin(a)*.5);frond.rotation.z=Math.PI/2.1;frond.rotation.y=a;g.add(frond)}
 }else if(kind==='pine'){
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.14,.2,1.5,lod===0?8:5),trunkMat);trunk.position.y=.75;g.add(trunk);
  for(let t=0;t<3;t++){const tier=new THREE.Mesh(new THREE.ConeGeometry(.9-t*.22,1.1,lod===0?8:5),crownMat);tier.position.y=1.6+t*.75;g.add(tier)}
 }else{
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.2,1.6,lod===0?8:5),trunkMat);trunk.position.y=.8;g.add(trunk);
  const crown=new THREE.Mesh(new THREE.SphereGeometry(1.05,lod===0?9:5,lod===0?7:4),crownMat);crown.position.y=1.95;g.add(crown);
  if(kind==='fruit'){const fruitMat=new THREE.MeshStandardMaterial({color:def.fruitColor});for(let f=0;f<6;f++){const fr=new THREE.Mesh(new THREE.SphereGeometry(.11,6,5),fruitMat);const a=f*(Math.PI*2/6);fr.position.set(Math.cos(a)*.85,1.95+Math.sin(f)*.3,Math.sin(a)*.85);g.add(fr)}}
 }
 if(lod===0)g.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true}});
 return g;
}

const scene=new THREE.Scene();scene.background=new THREE.Color(0x9fc7df);scene.fog=new THREE.Fog(0x9fc7df,60,160);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.05,500);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.querySelector('#game')!.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xdceeff,0x405044,2.2));const sun=new THREE.DirectionalLight(0xfff0d0,3);sun.position.set(35,70,25);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;scene.add(sun);
const world=new THREE.Group(),actors=new THREE.Group();scene.add(world,actors);

class Player{
 root=new THREE.Group(); velocity=new THREE.Vector3(); onGround=true;
 head:THREE.Object3D; torso:THREE.Object3D; leftLeg:THREE.Object3D; rightLeg:THREE.Object3D; leftArm:THREE.Object3D; rightArm:THREE.Object3D;
 constructor(){
  const skin=new THREE.MeshStandardMaterial({color:0xc68642,roughness:.85,metalness:.05});
  const shirt=new THREE.MeshStandardMaterial({color:0x2a5f8f,roughness:.9});
  const pants=new THREE.MeshStandardMaterial({color:0x2c3540,roughness:1});
  const hairMat=new THREE.MeshStandardMaterial({color:0x1a1410,roughness:1});
  const shoeMat=new THREE.MeshStandardMaterial({color:0x1c1c1c,roughness:.7});
  const eyeMat=new THREE.MeshBasicMaterial({color:0x111820});
  const white=new THREE.MeshBasicMaterial({color:0xf5f5f5});

  // Head
  this.head=new THREE.Mesh(new THREE.SphereGeometry(.27,12,10),skin);this.head.position.y=1.68;this.root.add(this.head);
  // Hair
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.29,12,8,0,Math.PI*2,0,Math.PI*.58),hairMat);hair.position.y=1.76;this.root.add(hair);
  const fringe=new THREE.Mesh(new THREE.BoxGeometry(.26,.09,.09),hairMat);fringe.position.set(0,1.68,.24);this.root.add(fringe);
  // Eyes
  for(const x of[-.08,.08]){
    const eyeWhite=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),white);eyeWhite.position.set(x,1.70,.25);this.root.add(eyeWhite);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(.018,6,5),eyeMat);pupil.position.set(x,1.70,.275);this.root.add(pupil);
  }
  // Torso
  this.torso=new THREE.Mesh(new THREE.CapsuleGeometry(.32,.58,6,10),shirt);this.torso.position.y=1.08;this.root.add(this.torso);
  // Neck
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.09,.11,.12,8),skin);neck.position.y=1.42;this.root.add(neck);
  // Legs + shoes
  for(const side of[-1,1]){
    const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.10,.68,4,8),pants);leg.position.set(.13*side,.42,0);this.root.add(leg);
    const shoe=new THREE.Mesh(new THREE.BoxGeometry(.14,.09,.26),shoeMat);shoe.position.set(.13*side,.05,.04);this.root.add(shoe);
    const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.08,.55,4,8),shirt);arm.position.set(.40*side,1.10,0);arm.rotation.z=-.10*side;this.root.add(arm);
    if(side<0){this.leftLeg=leg;this.leftArm=arm}else{this.rightLeg=leg;this.rightArm=arm}
  }
  this.root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true}});
  actors.add(this.root);
 }
 animate(t:number,moving:boolean,sprinting:boolean){
  const speed=sprinting?15:11;
  const swing=moving?Math.sin(t*speed)*.6:0;
  this.leftLeg.rotation.x=swing;this.rightLeg.rotation.x=-swing;
  this.leftArm.rotation.x=-swing*.7;this.rightArm.rotation.x=swing*.7;
  // Subtle torso lean when moving
  this.torso.rotation.x=moving?(sprinting?.08:.04):0;
 }
}
const player=new Player();

class Chunks{
 loaded=new Map<string,THREE.Group>();changes:Record<string,string[]>={};
 key(x:number,z:number){return`${x},${z}`}coord(v:number){return Math.floor(v/SIZE)}
 build(cx:number,cz:number,lod:number=0){
  const key=this.key(cx,cz),g=new THREE.Group();g.name=`chunk:${key}`;g.userData.lod=lod;
  // LOD 0 = high (near), 1 = medium, 2 = low (far)
  const segs = lod===0 ? 12 : lod===1 ? 6 : 3;
  const terrain=new THREE.PlaneGeometry(SIZE,SIZE,segs,segs);terrain.rotateX(-Math.PI/2);const pos=terrain.getAttribute('position');for(let i=0;i<pos.count;i++){const lx=pos.getX(i)+cx*SIZE+SIZE/2,lz=pos.getZ(i)+cz*SIZE+SIZE/2;pos.setY(i,terrainHeightAt(lx,lz));}terrain.computeVertexNormals();const ground=new THREE.Mesh(terrain,new THREE.MeshStandardMaterial({color:0x73975f,roughness:1}));ground.position.set(cx*SIZE+SIZE/2,0,cz*SIZE+SIZE/2);ground.receiveShadow=lod===0;ground.name='terrain';g.add(ground);
  const roadMat=new THREE.MeshStandardMaterial({color:0x3d4348,roughness:1});
  // Horizontal roads (along X, fixed Z = center)
  for(let k=-WORLD_RADIUS;k<=WORLD_RADIUS;k++){const center=k*ROAD_SPACING;
   if(center>=cz*SIZE-ROAD_WIDTH/2&&center<=(cz+1)*SIZE+ROAD_WIDTH/2){
    const rx=new THREE.Mesh(new THREE.PlaneGeometry(SIZE,ROAD_WIDTH,16,2),roadMat);rx.rotation.x=-Math.PI/2;const xp=rx.geometry.getAttribute('position');
    for(let i=0;i<xp.count;i++){const lx=xp.getX(i)+cx*SIZE+SIZE/2,lz=xp.getZ(i)+center;xp.setY(i,terrainHeightAt(lx,lz)+.055)}rx.geometry.computeVertexNormals();rx.position.set(cx*SIZE+SIZE/2,0,center);rx.name='road-x';g.add(rx);
   }}
  // Vertical roads (along Z, fixed X = center)
  for(let k=-WORLD_RADIUS;k<=WORLD_RADIUS;k++){const center=k*ROAD_SPACING;
   if(center>=cx*SIZE-ROAD_WIDTH/2&&center<=(cx+1)*SIZE+ROAD_WIDTH/2){
    const rz=new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH,SIZE,2,16),roadMat);rz.rotation.x=-Math.PI/2;const zp=rz.geometry.getAttribute('position');
    for(let i=0;i<zp.count;i++){const lx=zp.getX(i)+center,lz=zp.getZ(i)+cz*SIZE+SIZE/2;zp.setY(i,terrainHeightAt(lx,lz)+.055)}rz.geometry.computeVertexNormals();rz.position.set(center,0,cz*SIZE+SIZE/2);rz.name='road-z';g.add(rz);
   }}
  // Water is built from only the cells that are actually water. A full-chunk plane
  // makes shorelines look like invisible walls and can cover dry ground.
  const waterMat=new THREE.MeshStandardMaterial({color:0x4d91b5,transparent:true,opacity:.72,roughness:.15,metalness:.05,depthWrite:false});
  const waterGroup=new THREE.Group();waterGroup.name='water';
  const waterSegs=lod===0?8:lod===1?4:2,step=SIZE/waterSegs;
  for(let iz=0;iz<waterSegs;iz++)for(let ix=0;ix<waterSegs;ix++){
   const x0=cx*SIZE+ix*step,x1=x0+step,z0=cz*SIZE+iz*step,z1=z0+step;
   const samples=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
   if(!samples.every(([x,z])=>waterAt(x,z)))continue;
   const geom=new THREE.BufferGeometry();const verts=new Float32Array([0,WATER_LEVEL,0,step,WATER_LEVEL,0,step,WATER_LEVEL,step,0,WATER_LEVEL,step]);
   geom.setAttribute('position',new THREE.BufferAttribute(verts,3));geom.setIndex([0,2,1,0,3,2]);geom.computeVertexNormals();
   const water=new THREE.Mesh(geom,waterMat);water.position.set(x0,0,z0);water.name='water-cell';waterGroup.add(water);
  }
  if(waterGroup.children.length){g.add(waterGroup);g.userData.water=true}
  const removed=this.changes[key]||[];
  if(lod < 2){ // no trees on far LOD
    const maxTrees = lod===0 ? 9 : 4;
    for(let i=0;i<maxTrees;i++){
     if(hash(cx*17+i,cz*23-i)<=.56)continue;
     const tx=cx*SIZE+2+hash(cx+i,cz-i)*(SIZE-4),tz=cz*SIZE+2+hash(cx-i,cz+i)*(SIZE-4);
     if(roadAt(tx,tz)||waterAt(tx,tz))continue; // check the tree's own spot, not the chunk center
     const kind=pickTreeKind(cx,cz,i,tx,tz),def=RESOURCE_DEFS[kind],name=`tree-${i}`;
     const entry=removed.find(e=>e===name||e.startsWith(name+'@'));
     if(entry){
      const at=entry.includes('@')?Number(entry.split('@')[1]):0,elapsed=(Date.now()-at)/1000;
      if(elapsed<def.regrowSeconds){
       const stump=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,.28,6),new THREE.MeshStandardMaterial({color:0x5c4028}));
       stump.name=`stump-${i}`;stump.position.set(tx,terrainHeightAt(tx,tz)+.14,tz);
       if(lod===0){stump.castShadow=true;stump.receiveShadow=true}
       g.add(stump);continue;
      }
      const idx=removed.indexOf(entry);if(idx>=0)removed.splice(idx,1); // fully regrown — clear the record
     }
     const tree=buildTree(kind,lod);tree.name=name;
     tree.userData.resource={kind,hits:def.hitsToFell,maxHits:def.hitsToFell};
     tree.userData.colliderRadius=def.colliderRadius;
     tree.position.set(tx,terrainHeightAt(tx,tz),tz);
     g.add(tree);
    }
  }
  if(cx===0&&cz===0)this.home(g);world.add(g);this.loaded.set(key,g);
 }
 home(g:THREE.Group){
 const h=new THREE.Group();h.name='home';const hy=terrainHeightAt(HOME_X,HOME_Z);h.position.set(HOME_X,hy,HOME_Z);
 const wallMat=new THREE.MeshStandardMaterial({color:0xe6ded0,roughness:.9}),floorMat=new THREE.MeshStandardMaterial({color:0x9b8065,roughness:1}),roofMat=new THREE.MeshStandardMaterial({color:0x7c4d3d,roughness:.9}),dark=new THREE.MeshStandardMaterial({color:0x253746,roughness:.7});
 const floor=new THREE.Mesh(new THREE.BoxGeometry(9,.18,7),floorMat);floor.position.y=.09;floor.name='home-floor';h.add(floor);
 const wallH=3.6,th=.25,halfW=4.5,halfD=3.5;
 const back=new THREE.Mesh(new THREE.BoxGeometry(9,wallH,th),wallMat);back.position.set(0,wallH/2,-halfD);
 const left=new THREE.Mesh(new THREE.BoxGeometry(th,wallH,7),wallMat);left.position.set(-halfW,wallH/2,0);
 const right=new THREE.Mesh(new THREE.BoxGeometry(th,wallH,7),wallMat);right.position.set(halfW,wallH/2,0);
 const frontL=new THREE.Mesh(new THREE.BoxGeometry(3.95,wallH,th),wallMat);frontL.position.set(-2.525,wallH/2,halfD);
 const frontR=new THREE.Mesh(new THREE.BoxGeometry(3.95,wallH,th),wallMat);frontR.position.set(2.525,wallH/2,halfD);
 const frontTop=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.5,th),wallMat);frontTop.position.set(0,2.85,halfD);
 [back,left,right,frontL,frontR,frontTop].forEach((w,i)=>{w.name=`home-wall-${i}`;h.add(w)});
 const roof=new THREE.Mesh(new THREE.ConeGeometry(6.4,2.4,4),roofMat);roof.rotation.y=Math.PI/4;roof.position.y=4.8;roof.name='home-roof';h.add(roof);
 const doorPivot=new THREE.Group();doorPivot.name='front-door';doorPivot.position.set(-.55,0,halfD+.04);doorPivot.userData.interactable={action:'toggleDoor',label:'Front door'};
 const door=new THREE.Mesh(new THREE.BoxGeometry(1.1,2.1,.08),dark);door.position.set(.55,1.05,0);door.name='front-door-panel';doorPivot.add(door);h.add(doorPivot);
 const win=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.1,.08),dark);win.position.set(-2.3,1.7,halfD+.05);win.name='window';win.userData.interactable={action:'inspect',label:'Window'};h.add(win);
 const bed=new THREE.Mesh(new THREE.BoxGeometry(2.1,.45,3.1),new THREE.MeshStandardMaterial({color:0x657c91}));bed.position.set(-2.4,.35,-1.35);bed.name='bed';bed.userData.interactable={action:'rest',label:'Bed'};h.add(bed);
 const pillow=new THREE.Mesh(new THREE.BoxGeometry(1.8,.2,.55),new THREE.MeshStandardMaterial({color:0xd9d5ca}));pillow.position.set(0,.28,-1.1);bed.add(pillow);
 const table=new THREE.Mesh(new THREE.BoxGeometry(1.6,.75,1),new THREE.MeshStandardMaterial({color:0x765238}));table.position.set(2.5,.48,-1.1);table.name='table';table.userData.interactable={action:'inspect',label:'Table'};h.add(table);
 h.userData.collider={minX:HOME_X-4.5,maxX:HOME_X+4.5,minZ:HOME_Z-3.5,maxZ:HOME_Z+3.5,doorMinX:HOME_X-.55,doorMaxX:HOME_X+.55,wallThickness:.22};
 h.userData.doorOpen=(this.changes['0,0']||[]).includes('door-open');doorPivot.rotation.y=h.userData.doorOpen?-Math.PI/2:0;
 h.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true}});g.add(h)
}
 stream(px:number,pz:number){
  const cx=this.coord(px),cz=this.coord(pz);
  for(const[k,g]of this.loaded){const[a,b]=k.split(',').map(Number);if(Math.abs(a-cx)>RADIUS||Math.abs(b-cz)>RADIUS){world.remove(g);this.loaded.delete(k)}}
  const minX=Math.max(-WORLD_RADIUS,cx-RADIUS),maxX=Math.min(WORLD_RADIUS,cx+RADIUS),minZ=Math.max(-WORLD_RADIUS,cz-RADIUS),maxZ=Math.min(WORLD_RADIUS,cz+RADIUS);
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
   const dist=Math.max(Math.abs(x-cx),Math.abs(z-cz));
   const lod=dist<=2?0:dist<=4?1:2;
   const key=this.key(x,z),existing=this.loaded.get(key);
   if(!existing){this.build(x,z,lod)}
   else if(existing.userData.lod>lod){world.remove(existing);this.loaded.delete(key);this.build(x,z,lod)} // upgrade detail as player gets closer
  }
 }
}
const chunks=new Chunks();
let save:Save={version:1,player:{x:0,y:0,z:5,ry:0,mode:'tpp'},camera:{yaw:0,pitch:-.28,distance:7},changes:{},inventory:{}};
try{const raw=localStorage.getItem(SAVE_KEY);if(raw)save=JSON.parse(raw)}catch{}
chunks.changes=save.changes;chunks.stream(save.player.x,save.player.z);player.root.position.set(save.player.x,save.player.y,save.player.z);if(!Number.isFinite(player.root.position.y)||player.root.position.y<terrainHeightAt(player.root.position.x,player.root.position.z))player.root.position.y=terrainHeightAt(player.root.position.x,player.root.position.z);player.root.rotation.y=save.player.ry;
let mode:Mode=save.player.mode,camYaw=save.camera.yaw,camPitch=save.camera.pitch,camDistance=save.camera.distance,targetYaw=camYaw,targetPitch=camPitch,targetDistance=camDistance;
let inventory:Record<string,number>=save.inventory||{};
function saveNow(){save={version:1,player:{x:player.root.position.x,y:player.root.position.y,z:player.root.position.z,ry:player.root.rotation.y,mode},camera:{yaw:camYaw,pitch:camPitch,distance:camDistance},changes:chunks.changes,inventory};localStorage.setItem(SAVE_KEY,JSON.stringify(save))}

const keys=new Set<string>();addEventListener('keydown',e=>{keys.add(e.key.toLowerCase());if(e.key.toLowerCase()==='f')mode='fpp';if(e.key.toLowerCase()==='c')mode='tpp'});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
let pointer:number|null=null,lastX=0,lastY=0;
renderer.domElement.addEventListener('pointerdown',e=>{pointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)});
renderer.domElement.addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;targetYaw-=dx*.008;targetPitch=clamp(targetPitch-dy*.006,-1.15,.9)});
renderer.domElement.addEventListener('pointerup',()=>pointer=null);
renderer.domElement.addEventListener('pointercancel',()=>pointer=null);
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();targetDistance=clamp(targetDistance+e.deltaY*.008,2.2,13)},{passive:false});

const stick=document.querySelector('#stick') as HTMLElement,knob=document.querySelector('#knob') as HTMLElement;
let joy={x:0,y:0},joyActive=false;
const moveJoy=(e:PointerEvent)=>{if(!joyActive)return;const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let x=e.clientX-cx,y=e.clientY-cy,l=Math.hypot(x,y),m=43;if(l>m){x=x/l*m;y=y/l*m}joy={x:x/m,y:y/m};knob.style.transform=`translate(${x}px,${y}px)`};
stick.addEventListener('pointerdown',e=>{e.stopPropagation();joyActive=true;stick.setPointerCapture(e.pointerId);moveJoy(e)});stick.addEventListener('pointermove',moveJoy);stick.addEventListener('pointerup',()=>{joyActive=false;joy={x:0,y:0};knob.style.transform='translate(0,0)'});

function bindAction(el:HTMLElement,fn:()=>void){
 el.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();fn()});
}
bindAction(document.querySelector('#modeBtn') as HTMLButtonElement,()=>mode=mode==='tpp'?'fpp':'tpp');
bindAction(document.querySelector('#jumpBtn') as HTMLButtonElement,jump);
bindAction(document.querySelector('#runBtn') as HTMLButtonElement,()=>sprintToggle=!sprintToggle);
bindAction(document.querySelector('#interactBtn') as HTMLButtonElement,interact);
const prompt=document.querySelector('#prompt') as HTMLDivElement,status=document.querySelector('#status')!,target=document.querySelector('#target') as HTMLDivElement;
const inventoryEl=document.querySelector('#inventory') as HTMLDivElement;
const compass=document.querySelector('#compass') as HTMLDivElement;
const mapOverlay=document.querySelector('#mapOverlay') as HTMLDivElement;
const mapCanvas=document.querySelector('#mapCanvas') as HTMLCanvasElement;const mapCtx=mapCanvas.getContext('2d')!;
const mapBtn=document.querySelector('#mapBtn') as HTMLButtonElement, mapClose=document.querySelector('#mapClose') as HTMLButtonElement;
function openMap(open:boolean){mapOverlay.classList.toggle('show',open);if(open)drawMap();}
bindAction(mapBtn,()=>openMap(true));bindAction(mapClose,()=>openMap(false));
function drawMap(){const w=mapCanvas.width=mapCanvas.clientWidth*devicePixelRatio,h=mapCanvas.height=mapCanvas.clientHeight*devicePixelRatio;mapCtx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);const cw=mapCanvas.clientWidth,ch=mapCanvas.clientHeight;mapCtx.clearRect(0,0,cw,ch);mapCtx.fillStyle='#18232b';mapCtx.fillRect(0,0,cw,ch);const pad=18,cell=Math.min((cw-pad*2)/WORLD_DIAMETER,(ch-pad*2)/WORLD_DIAMETER);for(let cz=-WORLD_RADIUS;cz<=WORLD_RADIUS;cz++)for(let cx=-WORLD_RADIUS;cx<=WORLD_RADIUS;cx++){const sx=pad+(cx+WORLD_RADIUS)*cell,sy=pad+(WORLD_RADIUS-cz)*cell;const road=roadAt(cx*SIZE+SIZE/2,cz*SIZE+SIZE/2);mapCtx.fillStyle=waterAt(cx*SIZE+SIZE/2,cz*SIZE+SIZE/2)?'#4b86a4':road?'#555b60':'#657f57';mapCtx.fillRect(sx,sy,Math.ceil(cell)+.5,Math.ceil(cell)+.5);if(road){mapCtx.fillStyle='#777b7e';if(Math.abs((((cx*SIZE+SIZE/2+ROAD_SPACING/2)%ROAD_SPACING)+ROAD_SPACING)%ROAD_SPACING-ROAD_SPACING/2)<ROAD_WIDTH/2)mapCtx.fillRect(sx+cell*.38,sy,cell*.24,cell);if(Math.abs((((cz*SIZE+SIZE/2+ROAD_SPACING/2)%ROAD_SPACING)+ROAD_SPACING)%ROAD_SPACING-ROAD_SPACING/2)<ROAD_WIDTH/2)mapCtx.fillRect(sx,sy+cell*.38,cell,cell*.24)}}const px=pad+(thisCoord(player.root.position.x)+WORLD_RADIUS+.5)*cell,py=pad+(WORLD_RADIUS-thisCoord(player.root.position.z)+.5)*cell;mapCtx.fillStyle='#fff';mapCtx.beginPath();mapCtx.arc(px,py,Math.max(4,cell*.32),0,Math.PI*2);mapCtx.fill();const hx=pad+(Math.floor(HOME_X/SIZE)+WORLD_RADIUS+.5)*cell,hy=pad+(WORLD_RADIUS-Math.floor(HOME_Z/SIZE)+.5)*cell;mapCtx.fillStyle='#f0c674';mapCtx.fillRect(hx-cell*.25,hy-cell*.25,cell*.5,cell*.5);mapCtx.strokeStyle='#ffffff66';mapCtx.strokeRect(pad,pad,WORLD_DIAMETER*cell,WORLD_DIAMETER*cell);}

const fullscreenBtn=document.querySelector('#fullscreenBtn') as HTMLButtonElement;
function updateFullscreenButton(){fullscreenBtn.textContent=document.fullscreenElement?'⛶':'⛶';fullscreenBtn.title=document.fullscreenElement?'Exit fullscreen':'Fullscreen'}
fullscreenBtn.addEventListener('pointerdown',async e=>{e.preventDefault();e.stopPropagation();try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{}});
document.addEventListener('fullscreenchange',updateFullscreenButton);updateFullscreenButton();
let promptTimer=0,sprintToggle=false;
function say(t:string){prompt.textContent=t;prompt.classList.add('show');promptTimer=1.2}
function jump(){if(player.onGround){player.velocity.y=7.2;player.onGround=false}}
function addItem(item:string,qty:number){inventory[item]=(inventory[item]||0)+qty;renderInventory();saveNow()}
function renderInventory(){inventoryEl.innerHTML=Object.entries(inventory).filter(([,v])=>v>0).map(([k,v])=>`<span class="invItem">${ITEM_ICONS[k]||'•'} ${v}</span>`).join('')}
renderInventory();
function hitTree(tree:THREE.Object3D){
 const res=tree.userData.resource as {kind:ResourceKind;hits:number;maxHits:number};
 res.hits--;
 tree.scale.setScalar(Math.max(.72,1-.09*(res.maxHits-res.hits)));
 if(res.hits>0){say(`Hit ${res.kind} (${res.maxHits-res.hits}/${res.maxHits})`);return}
 const def=RESOURCE_DEFS[res.kind];
 const roll=hash(Math.round(tree.position.x*97),Math.round(tree.position.z*131));
 const qty=def.yieldQty[0]+Math.floor(roll*(def.yieldQty[1]-def.yieldQty[0]+1));
 addItem(def.yieldItem,qty);
 let msg=`Harvested ${qty} ${def.yieldItem}`;
 if(def.bonusItem&&def.bonusQty){const bq=def.bonusQty[0]+Math.floor(hash(Math.round(tree.position.z*97),Math.round(tree.position.x*131))*(def.bonusQty[1]-def.bonusQty[0]+1));addItem(def.bonusItem,bq);msg+=` + ${bq} ${def.bonusItem}`}
 const q=tree.getWorldPosition(new THREE.Vector3()),cx=chunks.coord(q.x),cz=chunks.coord(q.z),key=chunks.key(cx,cz),g=chunks.loaded.get(key);
 if(g){
  chunks.changes[key]??=[];chunks.changes[key].push(`${tree.name}@${Date.now()}`);
  g.remove(tree);
  const stump=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,.28,6),new THREE.MeshStandardMaterial({color:0x5c4028}));
  stump.name=tree.name.replace('tree-','stump-');stump.position.copy(tree.position);stump.position.y+=.14;stump.castShadow=true;stump.receiveShadow=true;g.add(stump);
 }
 say(msg);saveNow();
}
function getAimTarget():THREE.Object3D|null{
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,mode==='tpp'?0.15:0),camera);const objects:THREE.Object3D[]=[];
 world.traverse(o=>{
  if(o.name==='front-door'||o.name==='window'||o.name==='bed'||o.name==='table'||o.name.startsWith('tree-')||o.userData.interactable)objects.push(o);
 });
 const hit=ray.intersectObjects(objects,true)[0];if(!hit||hit.distance>3.5)return null;let o=hit.object;
 while(o.parent&&o.parent!==world&&!o.name.startsWith('tree-')&&o.name!=='front-door'&&o.name!=='window'&&o.name!=='bed'&&o.name!=='table'&&!o.userData.interactable)o=o.parent;
 return o;
}
function interact(){
 const o=getAimTarget();if(!o){say('Aim at something within reach');return}
 if(o.userData.resource){hitTree(o);return}
 const data=o.userData.interactable as {action:string;label:string}|undefined;if(!data){say('Nothing to use here');return}
 if(data.action==='toggleDoor'){const h=chunks.loaded.get('0,0')?.getObjectByName('home') as THREE.Group|null;if(!h){say('Door unavailable');return}const open=!Boolean(h.userData.doorOpen);h.userData.doorOpen=open;const changes=chunks.changes['0,0']??(chunks.changes['0,0']=[]),i=changes.indexOf('door-open');if(open&&i<0)changes.push('door-open');if(!open&&i>=0)changes.splice(i,1);o.rotation.y=open?-Math.PI/2:0;saveNow();say(open?'Door opened':'Door closed');return}
 if(data.action==='rest'){say('Bed — rest system attaches here');return}
 say(`USE · ${data.label}`)
}

const clock=new THREE.Clock();let autosave=0,lastCx=999,lastCz=999,walkTime=0;
function thisCoord(v:number){return Math.floor(v/SIZE)}
function canOccupy(x:number,z:number){
 const playerRadius=.34;if(Math.abs(thisCoord(x))>WORLD_RADIUS||Math.abs(thisCoord(z))>WORLD_RADIUS)return false;
 if(waterAt(x,z))return false;
 for(const g of chunks.loaded.values()){
  const home=g.getObjectByName('home') as THREE.Group|null;const box=home?.userData.collider as {minX:number;maxX:number;minZ:number;maxZ:number;doorMinX:number;doorMaxX:number;wallThickness:number}|undefined;
  if(box&&home){const inside=x+playerRadius>box.minX&&x-playerRadius<box.maxX&&z+playerRadius>box.minZ&&z-playerRadius<box.maxZ;if(inside){const nearLeft=x-box.minX<box.wallThickness+playerRadius,nearRight=box.maxX-x<box.wallThickness+playerRadius,nearBack=z-box.minZ<box.wallThickness+playerRadius,nearFront=box.maxZ-z<box.wallThickness+playerRadius,doorOpen=Boolean(home.userData.doorOpen),inDoor=doorOpen&&x>box.doorMinX-playerRadius&&x<box.doorMaxX+playerRadius;if(nearLeft||nearRight||nearBack||(nearFront&&!inDoor))return false}}
  for(const o of g.children){if(!o.name.startsWith('tree-'))continue;const r=Number(o.userData.colliderRadius||.72)+playerRadius,dx=x-o.position.x,dz=z-o.position.z;if(dx*dx+dz*dz<r*r)return false}
 }return true
}
function moveWithCollisions(dx:number,dz:number){
 const p=player.root.position;
 const nx=p.x+dx,nz=p.z+dz;
 if(canOccupy(nx,nz)){p.x=nx;p.z=nz;return}
 if(canOccupy(nx,p.z))p.x=nx;
 if(canOccupy(p.x,nz))p.z=nz;
}

function input(){let x=joy.x,y=joy.y;if(keys.has('a')||keys.has('arrowleft'))x-=1;if(keys.has('d')||keys.has('arrowright'))x+=1;if(keys.has('w')||keys.has('arrowup'))y-=1;if(keys.has('s')||keys.has('arrowdown'))y+=1;const l=Math.hypot(x,y);return l>1?{x:x/l,y:y/l}:{x,y}}
function update(dt:number){
 const iv=input(),moving=Math.hypot(iv.x,iv.y)>.08;
 const forward=new THREE.Vector3(Math.sin(camYaw),0,Math.cos(camYaw)),right=new THREE.Vector3(-Math.cos(camYaw),0,Math.sin(camYaw));
 const dir=new THREE.Vector3().addScaledVector(right,iv.x).addScaledVector(forward,-iv.y);
 const sprinting=(keys.has('shift')||sprintToggle)&&moving;
 if(dir.lengthSq()){dir.normalize();const desired=Math.atan2(dir.x,dir.z);player.root.rotation.y=angleLerp(player.root.rotation.y,desired,Math.min(1,dt*12));const speed=sprinting?9:6.2;player.velocity.x=dir.x*speed;player.velocity.z=dir.z*speed}
 else{player.velocity.x=lerp(player.velocity.x,0,Math.min(1,dt*10));player.velocity.z=lerp(player.velocity.z,0,Math.min(1,dt*10))}
 if(keys.has(' ')&&player.onGround)jump();
 player.velocity.y-=18*dt;player.root.position.y+=player.velocity.y*dt;
 // Use home floor height when inside the house, otherwise terrain
 let groundY=terrainHeightAt(player.root.position.x,player.root.position.z);
 const home=chunks.loaded.get('0,0')?.getObjectByName('home') as THREE.Group|undefined;
 if(home){const box=home.userData.collider;if(box&&player.root.position.x>box.minX&&player.root.position.x<box.maxX&&player.root.position.z>box.minZ&&player.root.position.z<box.maxZ){groundY=Math.max(groundY,home.position.y+0.18);}}
 if(player.root.position.y<=groundY){player.root.position.y=groundY;player.velocity.y=0;player.onGround=true}
 moveWithCollisions(player.velocity.x*dt,player.velocity.z*dt);
 const cx=chunks.coord(player.root.position.x),cz=chunks.coord(player.root.position.z);if(cx!==lastCx||cz!==lastCz){chunks.stream(player.root.position.x,player.root.position.z);lastCx=cx;lastCz=cz}
 camYaw=angleLerp(camYaw,targetYaw,Math.min(1,dt*12));camPitch=lerp(camPitch,targetPitch,Math.min(1,dt*12));camDistance=lerp(camDistance,targetDistance,Math.min(1,dt*12));
 player.root.visible=mode!=='fpp';
 const focus=player.root.position.clone();focus.y+=1.05;
 if(mode==='tpp'){const h=Math.cos(camPitch)*camDistance,pos=focus.clone();pos.x-=Math.sin(camYaw)*h;pos.y+=Math.sin(camPitch)*camDistance;pos.z-=Math.cos(camYaw)*h;const rayDir=pos.clone().sub(focus).normalize(),hits=new THREE.Raycaster(focus,rayDir,0,camDistance).intersectObjects(world.children,true),hit=hits.find(h=>h.object.name!=='terrain'&&h.object.name!=='water'&&!h.object.name.startsWith('road-'));if(hit)pos.copy(focus).add(rayDir.multiplyScalar(Math.max(1.35,hit.distance-.25)));camera.position.lerp(pos,Math.min(1,dt*14));camera.lookAt(focus)}
 else{const eye=player.root.position.clone();eye.y+=1.55;camera.position.lerp(eye,Math.min(1,dt*18));const look=eye.clone();look.x+=Math.sin(targetYaw)*Math.cos(targetPitch)*8;look.y+=Math.sin(targetPitch)*8;look.z+=Math.cos(targetYaw)*Math.cos(targetPitch)*8;camera.lookAt(look)}
 player.animate(walkTime+=dt,moving,sprinting);
 target.style.top=mode==='tpp'?'40%':'50%';const aimed=getAimTarget();target.classList.toggle('active',!!aimed);target.textContent=aimed?(aimed.name.startsWith('tree-')?'✚':'•'):'✚';
 if(aimed&&!moving&&!promptTimer){
  const r=aimed.userData.resource as {kind:string;hits:number;maxHits:number}|undefined;
  say(r?`USE · ${r.kind[0].toUpperCase()+r.kind.slice(1)} (${r.maxHits-r.hits}/${r.maxHits})`:`USE · ${aimed.name.replace('front-door','Front door').replace('tree-','Tree ')}`);
 }
 if(promptTimer>0){promptTimer-=dt;if(promptTimer<=0)prompt.classList.remove('show')}
 (document.querySelector('#modeBtn') as HTMLButtonElement).textContent=mode.toUpperCase();compass.style.transform=`translateX(-50%) rotate(${-camYaw*180/Math.PI}deg)`;if(mapOverlay.classList.contains('show'))drawMap();
 (document.querySelector('#runBtn') as HTMLButtonElement).textContent=sprintToggle?'RUN':'WALK';
 autosave+=dt;if(autosave>2){autosave=0;saveNow()}status.textContent=`${mode.toUpperCase()} · ${sprinting?'RUN':'WALK'} · chunk ${cx},${cz} · ${chunks.loaded.size} loaded`;
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
addEventListener('beforeunload',saveNow);
function loop(){requestAnimationFrame(loop);update(Math.min(clock.getDelta(),.05));renderer.render(scene,camera)}loop();
