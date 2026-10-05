import * as THREE from 'three';
import './style.css';

type Mode='tpp'|'fpp';
type Save={version:1;player:{x:number;y:number;z:number;ry:number;mode:Mode};camera:{yaw:number;pitch:number;distance:number};changes:Record<string,string[]>};
const SAVE_KEY='virtual-family-core-v1',SEED=847231,SIZE=32,RADIUS=3,WORLD_RADIUS=12;
const WORLD_DIAMETER=WORLD_RADIUS*2+1;
const terrainHeightAt=(x:number,z:number)=>{const broad=Math.sin(x*.018+SEED*.001)*1.7+Math.cos(z*.021-SEED*.0007)*1.35;const hills=Math.sin((x+z)*.045)*.75+Math.cos((x-z)*.032)*.55;return Math.max(0,broad+hills+.9)};
const waterAt=(x:number,z:number)=>{const a=Math.sin(x*.011+z*.017+SEED*.00003),b=Math.cos(x*.019-z*.009-SEED*.00002);return a+b>1.72&&terrainHeightAt(x,z)<2.1};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const angleLerp=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*Math.min(1,t);
const hash=(x:number,z:number)=>{let n=Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(SEED,1442695041);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296};

const scene=new THREE.Scene();scene.background=new THREE.Color(0x9fc7df);scene.fog=new THREE.Fog(0x9fc7df,75,190);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.05,500);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.querySelector('#game')!.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xdceeff,0x405044,2.2));const sun=new THREE.DirectionalLight(0xfff0d0,3);sun.position.set(35,70,25);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;scene.add(sun);
const world=new THREE.Group(),actors=new THREE.Group();scene.add(world,actors);

class Player{
 root=new THREE.Group();velocity=new THREE.Vector3();onGround=true;head:THREE.Object3D;torso:THREE.Object3D;leftLeg:THREE.Object3D;rightLeg:THREE.Object3D;leftArm:THREE.Object3D;rightArm:THREE.Object3D;
 constructor(){
  const skin=new THREE.MeshStandardMaterial({color:0xc58f72,roughness:.8}),shirt=new THREE.MeshStandardMaterial({color:0x2d4962}),pants=new THREE.MeshStandardMaterial({color:0x24303a});
  this.head=new THREE.Mesh(new THREE.SphereGeometry(.28,16,12),skin);this.head.position.y=1.72;
  this.torso=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.65,5,10),shirt);this.torso.position.y=1.1;this.root.add(this.head,this.torso);
  for(const s of[-1,1]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.11,.7,4,8),pants);leg.position.set(.14*s,.43,0);const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.09,.58,4,8),skin);arm.position.set(.43*s,1.1,0);arm.rotation.z=-.12*s;this.root.add(leg,arm);if(s<0){this.leftLeg=leg;this.leftArm=arm}else{this.rightLeg=leg;this.rightArm=arm}}
  this.root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true}});actors.add(this.root);
 }
 animate(t:number,moving:boolean,sprinting:boolean){const swing=moving?Math.sin(t*(sprinting?14:10))*.55:0;this.leftLeg.rotation.x=swing;this.rightLeg.rotation.x=-swing;this.leftArm.rotation.x=-swing*.75;this.rightArm.rotation.x=swing*.75}
}
const player=new Player();

class Chunks{
 loaded=new Map<string,THREE.Group>();changes:Record<string,string[]>={};
 key(x:number,z:number){return`${x},${z}`}coord(v:number){return Math.floor(v/SIZE)}
 build(cx:number,cz:number){
  const key=this.key(cx,cz),g=new THREE.Group();g.name=`chunk:${key}`;
  const roadSeed=Math.abs(cx)%4===0||Math.abs(cz)%4===0;
  const terrain=new THREE.PlaneGeometry(SIZE,SIZE,16,16);terrain.rotateX(-Math.PI/2);const pos=terrain.getAttribute('position');for(let i=0;i<pos.count;i++){const lx=pos.getX(i)+cx*SIZE+SIZE/2,lz=pos.getZ(i)+cz*SIZE+SIZE/2;pos.setY(i,terrainHeightAt(lx,lz));}terrain.computeVertexNormals();const ground=new THREE.Mesh(terrain,new THREE.MeshStandardMaterial({color:0x73975f,roughness:1}));ground.position.set(cx*SIZE+SIZE/2,0,cz*SIZE+SIZE/2);ground.receiveShadow=true;ground.name='terrain';g.add(ground);
  if(waterAt(cx*SIZE+SIZE/2,cz*SIZE+SIZE/2)){const water=new THREE.Mesh(new THREE.PlaneGeometry(SIZE,SIZE),new THREE.MeshStandardMaterial({color:0x4d91b5,transparent:true,opacity:.78,roughness:.15,metalness:.05}));water.rotation.x=-Math.PI/2;water.position.set(cx*SIZE+SIZE/2,.72,cz*SIZE+SIZE/2);water.name='water';water.receiveShadow=false;g.add(water);g.userData.water=true;}
  const xRoad=Math.abs(cx)%4===0,zRoad=Math.abs(cz)%4===0,road=xRoad||zRoad;if(road){const roadMat=new THREE.MeshStandardMaterial({color:0x3d4348});if(xRoad){const r=new THREE.Mesh(new THREE.BoxGeometry(5,.04,SIZE),roadMat);r.position.set(cx*SIZE+SIZE/2,terrainHeightAt(cx*SIZE+SIZE/2,cz*SIZE+SIZE/2)+.04,cz*SIZE+SIZE/2);r.name='road-x';g.add(r)}if(zRoad){const r=new THREE.Mesh(new THREE.BoxGeometry(SIZE,.04,5),roadMat);r.position.set(cx*SIZE+SIZE/2,terrainHeightAt(cx*SIZE+SIZE/2,cz*SIZE+SIZE/2)+.05,cz*SIZE+SIZE/2);r.name='road-z';g.add(r)}}
  const removed=this.changes[key]||[];
  for(let i=0;i<9;i++){if(hash(cx*17+i,cz*23-i)<=.56||road||removed.includes(`tree-${i}`))continue;const tree=new THREE.Group();tree.name=`tree-${i}`;tree.userData.colliderRadius=.72;const tx=cx*SIZE+4+hash(cx+i,cz-i)*24,tz=cz*SIZE+4+hash(cx-i,cz+i)*24;tree.position.set(tx,terrainHeightAt(tx,tz),tz);const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18,.23,1.7,8),new THREE.MeshStandardMaterial({color:0x694b35}));trunk.position.y=.85;const crown=new THREE.Mesh(new THREE.SphereGeometry(1.15,9,7),new THREE.MeshStandardMaterial({color:0x3d7148}));crown.position.y=2.05;tree.add(trunk,crown);tree.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true}});g.add(tree)}
  if(cx===0&&cz===0)this.home(g);world.add(g);this.loaded.set(key,g);
 }
 home(g:THREE.Group){
 const h=new THREE.Group();h.name='home';const hy=terrainHeightAt(10,10);h.position.set(10,hy,10);
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
 h.userData.collider={minX:5.5,maxX:14.5,minZ:6.5,maxZ:13.5,doorMinX:9.45,doorMaxX:10.55,wallThickness:.22};
 h.userData.doorOpen=(this.changes['0,0']||[]).includes('door-open');doorPivot.rotation.y=h.userData.doorOpen?-Math.PI/2:0;
 h.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true}});g.add(h)
}
 stream(px:number,pz:number){const cx=this.coord(px),cz=this.coord(pz);for(const[k,g]of this.loaded){const[a,b]=k.split(',').map(Number);if(Math.abs(a-cx)>RADIUS||Math.abs(b-cz)>RADIUS){world.remove(g);this.loaded.delete(k)}}const minX=Math.max(-WORLD_RADIUS,cx-RADIUS),maxX=Math.min(WORLD_RADIUS,cx+RADIUS),minZ=Math.max(-WORLD_RADIUS,cz-RADIUS),maxZ=Math.min(WORLD_RADIUS,cz+RADIUS);for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)if(!this.loaded.has(this.key(x,z)))this.build(x,z)}
 harvestTree(tree:THREE.Object3D){const q=tree.getWorldPosition(new THREE.Vector3()),cx=this.coord(q.x),cz=this.coord(q.z),g=this.loaded.get(this.key(cx,cz));if(!g)return;this.changes[this.key(cx,cz)]??=[];this.changes[this.key(cx,cz)].push(tree.name);g.remove(tree);saveNow()}
}
const chunks=new Chunks();
let save:Save={version:1,player:{x:0,y:0,z:5,ry:0,mode:'tpp'},camera:{yaw:0,pitch:-.28,distance:7},changes:{}};
try{const raw=localStorage.getItem(SAVE_KEY);if(raw)save=JSON.parse(raw)}catch{}
chunks.changes=save.changes;chunks.stream(save.player.x,save.player.z);player.root.position.set(save.player.x,save.player.y,save.player.z);if(!Number.isFinite(player.root.position.y)||player.root.position.y<terrainHeightAt(player.root.position.x,player.root.position.z))player.root.position.y=terrainHeightAt(player.root.position.x,player.root.position.z);player.root.rotation.y=save.player.ry;
let mode:Mode=save.player.mode,camYaw=save.camera.yaw,camPitch=save.camera.pitch,camDistance=save.camera.distance,targetYaw=camYaw,targetPitch=camPitch,targetDistance=camDistance;
function saveNow(){save={version:1,player:{x:player.root.position.x,y:player.root.position.y,z:player.root.position.z,ry:player.root.rotation.y,mode},camera:{yaw:camYaw,pitch:camPitch,distance:camDistance},changes:chunks.changes};localStorage.setItem(SAVE_KEY,JSON.stringify(save))}

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
const compass=document.querySelector('#compass') as HTMLDivElement;
const mapOverlay=document.querySelector('#mapOverlay') as HTMLDivElement;
const mapCanvas=document.querySelector('#mapCanvas') as HTMLCanvasElement;const mapCtx=mapCanvas.getContext('2d')!;
const mapBtn=document.querySelector('#mapBtn') as HTMLButtonElement, mapClose=document.querySelector('#mapClose') as HTMLButtonElement;
function openMap(open:boolean){mapOverlay.classList.toggle('show',open);if(open)drawMap();}
bindAction(mapBtn,()=>openMap(true));bindAction(mapClose,()=>openMap(false));
function drawMap(){const w=mapCanvas.width=mapCanvas.clientWidth*devicePixelRatio,h=mapCanvas.height=mapCanvas.clientHeight*devicePixelRatio;mapCtx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);const cw=mapCanvas.clientWidth,ch=mapCanvas.clientHeight;mapCtx.clearRect(0,0,cw,ch);mapCtx.fillStyle='#18232b';mapCtx.fillRect(0,0,cw,ch);const pad=18,cell=Math.min((cw-pad*2)/WORLD_DIAMETER,(ch-pad*2)/WORLD_DIAMETER);for(let cz=-WORLD_RADIUS;cz<=WORLD_RADIUS;cz++)for(let cx=-WORLD_RADIUS;cx<=WORLD_RADIUS;cx++){const sx=pad+(cx+WORLD_RADIUS)*cell,sy=pad+(WORLD_RADIUS-cz)*cell;const road=Math.abs(cx)%4===0||Math.abs(cz)%4===0;mapCtx.fillStyle=waterAt(cx*SIZE+SIZE/2,cz*SIZE+SIZE/2)?'#4b86a4':road?'#555b60':'#657f57';mapCtx.fillRect(sx,sy,Math.ceil(cell)+.5,Math.ceil(cell)+.5);if(road){mapCtx.fillStyle='#777b7e';if(Math.abs(cx)%4===0)mapCtx.fillRect(sx+cell*.38,sy,cell*.24,cell);if(Math.abs(cz)%4===0)mapCtx.fillRect(sx,sy+cell*.38,cell,cell*.24)}}const px=pad+(thisCoord(player.root.position.x)+WORLD_RADIUS+.5)*cell,py=pad+(WORLD_RADIUS-thisCoord(player.root.position.z)+.5)*cell;mapCtx.fillStyle='#fff';mapCtx.beginPath();mapCtx.arc(px,py,Math.max(4,cell*.32),0,Math.PI*2);mapCtx.fill();const hx=pad+(0+WORLD_RADIUS+.5)*cell,hy=pad+(WORLD_RADIUS-0+.5)*cell;mapCtx.fillStyle='#f0c674';mapCtx.fillRect(hx-cell*.25,hy-cell*.25,cell*.5,cell*.5);mapCtx.strokeStyle='#ffffff66';mapCtx.strokeRect(pad,pad,WORLD_DIAMETER*cell,WORLD_DIAMETER*cell);}

const fullscreenBtn=document.querySelector('#fullscreenBtn') as HTMLButtonElement;
function updateFullscreenButton(){fullscreenBtn.textContent=document.fullscreenElement?'⛶':'⛶';fullscreenBtn.title=document.fullscreenElement?'Exit fullscreen':'Fullscreen'}
fullscreenBtn.addEventListener('pointerdown',async e=>{e.preventDefault();e.stopPropagation();try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{}});
document.addEventListener('fullscreenchange',updateFullscreenButton);updateFullscreenButton();
let promptTimer=0,sprintToggle=false;
function say(t:string){prompt.textContent=t;prompt.classList.add('show');promptTimer=1.2}
function jump(){if(player.onGround){player.velocity.y=7.2;player.onGround=false}}
function getAimTarget():THREE.Object3D|null{
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);const objects:THREE.Object3D[]=[];
 world.traverse(o=>{if(o.name==='front-door'||o.name==='window'||o.name.startsWith('tree-'))objects.push(o)});
 const hit=ray.intersectObjects(objects,true)[0];if(!hit||hit.distance>3.2)return null;let o=hit.object;
 while(o.parent&&o.parent!==world&&!o.name.startsWith('tree-')&&o.name!=='front-door'&&o.name!=='window')o=o.parent;
 return o;
}
function interact(){
 const o=getAimTarget();if(!o){say('Aim at something within reach');return}
 if(o.name.startsWith('tree-')){chunks.harvestTree(o);say('Tree harvested — change saved');return}
 const data=o.userData.interactable as {action:string;label:string}|undefined;if(!data){say('Nothing to use here');return}
 if(data.action==='toggleDoor'){const h=chunks.loaded.get('0,0')?.getObjectByName('home') as THREE.Group|null;if(!h){say('Door unavailable');return}const open=!Boolean(h.userData.doorOpen);h.userData.doorOpen=open;const changes=chunks.changes['0,0']??(chunks.changes['0,0']=[]),i=changes.indexOf('door-open');if(open&&i<0)changes.push('door-open');if(!open&&i>=0)changes.splice(i,1);o.rotation.y=open?-Math.PI/2:0;saveNow();say(open?'Door opened':'Door closed');return}
 if(data.action==='rest'){say('Bed — rest system attaches here');return}
 say(`USE · ${data.label}`)
}

const clock=new THREE.Clock();let autosave=0,lastCx=999,lastCz=999,walkTime=0;
function thisCoord(v:number){return Math.floor(v/SIZE)}
function canOccupy(x:number,z:number){
 const playerRadius=.34;if(Math.abs(thisCoord(x))>WORLD_RADIUS||Math.abs(thisCoord(z))>WORLD_RADIUS||waterAt(x,z))return false;
 for(const g of chunks.loaded.values()){
  const home=g.getObjectByName('home');const box=home?.userData.collider as {minX:number;maxX:number;minZ:number;maxZ:number;doorMinX:number;doorMaxX:number;wallThickness:number}|undefined;
  if(box){const inside=x+playerRadius>box.minX&&x-playerRadius<box.maxX&&z+playerRadius>box.minZ&&z-playerRadius<box.maxZ;if(inside){const nearLeft=x-box.minX<box.wallThickness+playerRadius,nearRight=box.maxX-x<box.wallThickness+playerRadius,nearBack=z-box.minZ<box.wallThickness+playerRadius,nearFront=box.maxZ-z<box.wallThickness+playerRadius,inDoor=x>box.doorMinX-playerRadius&&x<box.doorMaxX+playerRadius;if(nearLeft||nearRight||nearBack||(nearFront&&!inDoor))return false}}
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
 player.velocity.y-=18*dt;player.root.position.y+=player.velocity.y*dt;const groundY=terrainHeightAt(player.root.position.x,player.root.position.z);if(player.root.position.y<=groundY){player.root.position.y=groundY;player.velocity.y=0;player.onGround=true}
 moveWithCollisions(player.velocity.x*dt,player.velocity.z*dt);
 const cx=chunks.coord(player.root.position.x),cz=chunks.coord(player.root.position.z);if(cx!==lastCx||cz!==lastCz){chunks.stream(player.root.position.x,player.root.position.z);lastCx=cx;lastCz=cz}
 camYaw=angleLerp(camYaw,targetYaw,Math.min(1,dt*12));camPitch=lerp(camPitch,targetPitch,Math.min(1,dt*12));camDistance=lerp(camDistance,targetDistance,Math.min(1,dt*12));
 player.root.visible=mode!=='fpp';
 const focus=player.root.position.clone();focus.y+=1.05;
 if(mode==='tpp'){const h=Math.cos(camPitch)*camDistance,pos=focus.clone();pos.x-=Math.sin(camYaw)*h;pos.y+=Math.sin(camPitch)*camDistance;pos.z-=Math.cos(camYaw)*h;const rayDir=pos.clone().sub(focus).normalize(),hits=new THREE.Raycaster(focus,rayDir,0,camDistance).intersectObjects(world.children,true),hit=hits.find(h=>h.object.name!=='ground');if(hit)pos.copy(focus).add(rayDir.multiplyScalar(Math.max(1.35,hit.distance-.2)));camera.position.lerp(pos,Math.min(1,dt*14));camera.lookAt(focus)}
 else{const eye=player.root.position.clone();eye.y+=1.55;camera.position.lerp(eye,Math.min(1,dt*18));const look=eye.clone();look.x+=Math.sin(targetYaw)*Math.cos(targetPitch)*8;look.y+=Math.sin(targetPitch)*8;look.z+=Math.cos(targetYaw)*Math.cos(targetPitch)*8;camera.lookAt(look)}
 player.animate(walkTime+=dt,moving,sprinting);
 const aimed=getAimTarget();target.classList.toggle('active',!!aimed);target.textContent=aimed?(aimed.name.startsWith('tree-')?'✚':'•'):'✚';
 if(aimed&&!moving&&!promptTimer)say(`USE · ${aimed.name.replace('front-door','Front door').replace('tree-','Tree ')}`);
 if(promptTimer>0){promptTimer-=dt;if(promptTimer<=0)prompt.classList.remove('show')}
 (document.querySelector('#modeBtn') as HTMLButtonElement).textContent=mode.toUpperCase();compass.style.transform=`translateX(-50%) rotate(${-camYaw*180/Math.PI}deg)`;if(mapOverlay.classList.contains('show'))drawMap();
 (document.querySelector('#runBtn') as HTMLButtonElement).textContent=sprintToggle?'RUN':'WALK';
 autosave+=dt;if(autosave>2){autosave=0;saveNow()}status.textContent=`${mode.toUpperCase()} · ${sprinting?'RUN':'WALK'} · chunk ${cx},${cz} · ${chunks.loaded.size} loaded`;
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
addEventListener('beforeunload',saveNow);
function loop(){requestAnimationFrame(loop);update(Math.min(clock.getDelta(),.05));renderer.render(scene,camera)}loop();
