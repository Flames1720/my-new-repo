import * as THREE from 'three';
import './style.css';
import { WildlifeSystem, isSharedAnimalAsset, type Biome, speciesColor } from './fauna';

type Mode='tpp'|'fpp';
type Save={version:1;player:{x:number;y:number;z:number;ry:number;mode:Mode};camera:{yaw:number;pitch:number;distance:number};changes:Record<string,string[]>;inventory:Record<string,number>;wildlifeTrust?:Record<string,number>;worldTime?:number};
const IS_TOUCH_DEVICE=typeof matchMedia!=='undefined'&&matchMedia('(pointer: coarse)').matches;
const LOW_POWER_MODE=IS_TOUCH_DEVICE||(navigator.hardwareConcurrency||4)<=4;
const SAVE_KEY='virtual-family-core-v1',SEED=847231,SIZE=16,RADIUS=LOW_POWER_MODE?5:7,WORLD_RADIUS=18;
const WORLD_DIAMETER=WORLD_RADIUS*2+1;
const WATER_LEVEL=1.25,ROAD_SPACING=128,ROAD_WIDTH=5.5;
const HOME_X=8,HOME_Z=8,HOME_FLATTEN_RADIUS=6.5,HOME_CLEAR_MARGIN=2.2;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const mountainMaskAt=(x:number,z:number)=>{const n=Math.sin(x*.0035+SEED*.00011)*Math.cos(z*.0041-SEED*.00009)+Math.sin((x+z)*.0027+SEED*.00005)*.6;return clamp((n-.25)/0.55,0,1)};
const mountainNoiseAt=(x:number,z:number)=>Math.max(0,Math.sin(x*.05+z*.03+SEED*.0002)*2.2+Math.cos(x*.034-z*.047-SEED*.00015)*1.8+Math.sin((x-z)*.08)*.9);
const rawTerrainHeightAt=(x:number,z:number)=>{const broad=Math.sin(x*.018+SEED*.001)*1.7+Math.cos(z*.021-SEED*.0007)*1.35;const hills=Math.sin((x+z)*.045)*.75+Math.cos((x-z)*.032)*.55;const mask=mountainMaskAt(x,z);const mountain=mask*mask*mountainNoiseAt(x,z)*1.8;return Math.max(0,broad+hills+.9+mountain)};
const HOME_BASE_HEIGHT=rawTerrainHeightAt(HOME_X,HOME_Z);
const roadAt=(x:number,z:number)=>{const mx=Math.abs((((x+ROAD_SPACING/2)%ROAD_SPACING)+ROAD_SPACING)%ROAD_SPACING-ROAD_SPACING/2),mz=Math.abs((((z+ROAD_SPACING/2)%ROAD_SPACING)+ROAD_SPACING)%ROAD_SPACING-ROAD_SPACING/2);return mx<ROAD_WIDTH/2||mz<ROAD_WIDTH/2};
const nearHome=(x:number,z:number)=>x>HOME_X-4.5-HOME_CLEAR_MARGIN&&x<HOME_X+4.5+HOME_CLEAR_MARGIN&&z>HOME_Z-3.5-HOME_CLEAR_MARGIN&&z<HOME_Z+3.5+HOME_CLEAR_MARGIN;
const lakeSignalAt=(x:number,z:number)=>Math.sin(x*.011+z*.017+SEED*.00003)+Math.cos(x*.019-z*.009-SEED*.00002);
const lakeDepressionAt=(x:number,z:number)=>{if(nearHome(x,z))return 0;const edge=clamp((lakeSignalAt(x,z)-1.38)/.3,0,1),smooth=edge*edge*(3-2*edge),lowland=clamp((WATER_LEVEL+1-rawTerrainHeightAt(x,z))/1,0,1);return smooth*lowland};
const terrainHeightAt=(x:number,z:number)=>{const raw=rawTerrainHeightAt(x,z),d=Math.hypot(x-HOME_X,z-HOME_Z),t=d<HOME_FLATTEN_RADIUS?1-d/HOME_FLATTEN_RADIUS:0,ground=t?raw+(HOME_BASE_HEIGHT-raw)*t:raw;return ground-lakeDepressionAt(x,z)*2.4};
const waterDepthAt=(x:number,z:number)=>Math.min(WATER_LEVEL-terrainHeightAt(x,z),(lakeDepressionAt(x,z)-.02)*6);
const waterAt=(x:number,z:number)=>!nearHome(x,z)&&waterDepthAt(x,z)>.015;
function biomeAt(x:number,z:number):Biome{
 const h=terrainHeightAt(x,z),nearWater=waterAt(x,z)||waterAt(x+3,z)||waterAt(x-3,z)||waterAt(x,z+3)||waterAt(x,z-3);
 if(nearWater&&h<2.7)return h<1.9?'wetland':'shore';
 if(h>7.6)return'alpine';
 const canopy=Math.sin(x*.013+SEED*.0001)+Math.cos(z*.012-SEED*.0002)+Math.sin((x-z)*.007);
 return canopy>.35?'forest':'meadow';
}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const angleLerp=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*Math.min(1,t);
const hash=(x:number,z:number)=>{let n=Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(SEED,1442695041);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296};
const grassColor=new THREE.Color(0x6f9a5a),rockTintColor=new THREE.Color(0x8b8680),snowColor=new THREE.Color(0xf2f4f6),forestTintColor=new THREE.Color(0x52754d),meadowTintColor=new THREE.Color(0x91ad69),wetlandTintColor=new THREE.Color(0x9a9a63),shoreTintColor=new THREE.Color(0xc2b383),lakeSandColor=new THREE.Color(0xb09a68),lakeSiltColor=new THREE.Color(0x5c5948);
function terrainColorAt(h:number,x:number,z:number):THREE.Color{
 let c:THREE.Color;
 if(h<4.0)c=grassColor.clone();
 else if(h<5.2)c=grassColor.clone().lerp(rockTintColor,(h-4.0)/1.2);
 else if(h<7.0)c=rockTintColor.clone();
 else if(h<8.2)c=rockTintColor.clone().lerp(snowColor,(h-7.0)/1.2);
 else c=snowColor.clone();
 const biome=biomeAt(x,z);
 if(biome==='forest')c.lerp(forestTintColor,.2);
 else if(biome==='meadow')c.lerp(meadowTintColor,.12);
 else if(biome==='wetland')c.lerp(wetlandTintColor,.24);
 else if(biome==='shore')c.lerp(shoreTintColor,.45);
 const lakeDepth=lakeDepressionAt(x,z);if(lakeDepth>.04)c.lerp(lakeSandColor,(1-lakeDepth)*.62).lerp(lakeSiltColor,lakeDepth*.68);
 return c;
}

// --- Resource model: every harvestable thing is data, not a special case ---
type ResourceKind='oak'|'pine'|'fruit'|'palm'|'rock'|'boulder';
interface ResourceDef{family:'tree'|'rock';hitsToFell:number;regrowSeconds:number;colliderRadius:number;yieldItem:string;yieldQty:[number,number];bonusItem?:string;bonusQty?:[number,number];trunkColor?:number;crownColor?:number;fruitColor?:number;rockColor?:number}
const RESOURCE_DEFS:Record<ResourceKind,ResourceDef>={
 oak:{family:'tree',hitsToFell:3,regrowSeconds:180,colliderRadius:.72,yieldItem:'Wood',yieldQty:[2,4],trunkColor:0x694b35,crownColor:0x3d7148},
 pine:{family:'tree',hitsToFell:2,regrowSeconds:140,colliderRadius:.6,yieldItem:'Pine Wood',yieldQty:[1,3],trunkColor:0x5b4330,crownColor:0x2e5c3e},
 fruit:{family:'tree',hitsToFell:4,regrowSeconds:220,colliderRadius:.72,yieldItem:'Wood',yieldQty:[1,3],bonusItem:'Fruit',bonusQty:[2,5],trunkColor:0x6b4a32,crownColor:0x4a7a3f,fruitColor:0xcc4433},
 palm:{family:'tree',hitsToFell:3,regrowSeconds:200,colliderRadius:.55,yieldItem:'Palm Wood',yieldQty:[1,2],trunkColor:0x8a6a3f,crownColor:0x4f8a3d},
 rock:{family:'rock',hitsToFell:3,regrowSeconds:Infinity,colliderRadius:.55,yieldItem:'Stone',yieldQty:[2,4],rockColor:0x8c8f93},
 boulder:{family:'rock',hitsToFell:6,regrowSeconds:Infinity,colliderRadius:.95,yieldItem:'Stone',yieldQty:[5,9],bonusItem:'Ore',bonusQty:[1,2],rockColor:0x6f7378}
};
const ITEM_ICONS:Record<string,string>={Wood:'🪵','Pine Wood':'🪵','Palm Wood':'🪵',Fruit:'🍎',Stone:'🪨',Ore:'⛏️'};
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
function buildRock(kind:ResourceKind,lod:number):THREE.Group{
 const g=new THREE.Group();const def=RESOURCE_DEFS[kind];
 const mat=new THREE.MeshStandardMaterial({color:def.rockColor,roughness:1,flatShading:true});
 const base=kind==='boulder'?1.05:.55;
 const geo=new THREE.IcosahedronGeometry(base,lod===0?1:0);
 const gp=geo.getAttribute('position');
 for(let i=0;i<gp.count;i++){const j=(hash(Math.round(gp.getX(i)*97+i*13),Math.round(gp.getZ(i)*131-i*7))-.5)*.22;gp.setXYZ(i,gp.getX(i)*(1+j),gp.getY(i)*(1+j*.6),gp.getZ(i)*(1+j))}
 geo.computeVertexNormals();
 const rock=new THREE.Mesh(geo,mat);rock.position.y=base*.55;rock.rotation.y=hash(kind==='boulder'?1:0,Math.round(base*1000))*Math.PI*2;g.add(rock);
 if(lod===0)g.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true}});
 return g;
}

// Shared animated water material — one compiled shader driven by a single time uniform.
// Ripple is computed from WORLD position (via modelMatrix), not local vertex position,
// because water is built as many small per-cell tiles — using local coords would make
// each tile ripple out of phase and crack visibly at shared edges.
const waterMaterial=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,transparent:true,opacity:.87,roughness:.24,metalness:.025,depthWrite:false,side:THREE.DoubleSide});
let waterShader:{uniforms:{uTime:{value:number}}}|null=null;
waterMaterial.onBeforeCompile=(shader)=>{
 shader.uniforms.uTime={value:0};
 shader.vertexShader='uniform float uTime;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n  vec4 ripplePos = modelMatrix * vec4(transformed, 1.0);\n  transformed.y += sin(ripplePos.x*0.55+uTime*1.3)*0.06 + cos(ripplePos.z*0.42-uTime*0.9)*0.05;');
 waterShader=shader as any;
};

const scene=new THREE.Scene();const skyColor=new THREE.Color(0x9fc7df);scene.background=skyColor;scene.fog=new THREE.Fog(0x9fc7df,60,160);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.05,500);
const renderer=new THREE.WebGLRenderer({antialias:!LOW_POWER_MODE,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,LOW_POWER_MODE?1.25:1.65));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=!LOW_POWER_MODE;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.querySelector('#game')!.appendChild(renderer.domElement);
const hemisphere=new THREE.HemisphereLight(0xdceeff,0x405044,2.2);scene.add(hemisphere);const sun=new THREE.DirectionalLight(0xfff0d0,3);sun.position.set(35,70,25);sun.castShadow=!LOW_POWER_MODE;sun.shadow.mapSize.set(LOW_POWER_MODE?512:1024,LOW_POWER_MODE?512:1024);sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;scene.add(sun,sun.target);
const daySky=new THREE.Color(0x9fc7df),nightSky=new THREE.Color(0x19273b),twilightSky=new THREE.Color(0xc58d79),underwaterFogColor=new THREE.Color(0x15566b);let skyTimer=0,underwater=false;
function updateSky(dt:number){skyTimer+=dt;if(skyTimer<.5)return;skyTimer=0;const angle=(worldTime-6)*Math.PI/12,daylight=clamp(Math.sin(angle),0,1),twilight=clamp(1-Math.abs(Math.sin(angle))/.45,0,1);skyColor.copy(nightSky).lerp(daySky,daylight).lerp(twilightSky,twilight*.72);if(scene.fog){const fog=scene.fog as THREE.Fog;fog.color.copy(underwater?underwaterFogColor:skyColor);fog.near=underwater?1.5:60;fog.far=underwater?18:160}hemisphere.intensity=.45+daylight*1.65;sun.intensity=.12+daylight*2.85+twilight*.35;sun.color.set(twilight>.1?0xffbc8b:daylight>.18?0xfff0d0:0x9bb4dd);sun.position.set(player.root.position.x+Math.cos(angle)*85,player.root.position.y+Math.sin(angle)*85,player.root.position.z+28);sun.target.position.copy(player.root.position);}
const world=new THREE.Group(),actors=new THREE.Group();scene.add(world,actors);
const splashMaterial=new THREE.MeshBasicMaterial({color:0xb7e5d8,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
const splashRing=new THREE.Mesh(new THREE.RingGeometry(.22,.29,24),splashMaterial);splashRing.rotation.x=-Math.PI/2;splashRing.visible=false;scene.add(splashRing);let splashAge=1;
function waterSplash(x:number,z:number){splashAge=0;splashRing.position.set(x,WATER_LEVEL+.16,z);splashRing.scale.setScalar(.65);splashRing.visible=true}
function updateSplash(dt:number){if(splashAge>=.65)return;splashAge+=dt;splashRing.scale.setScalar(.65+splashAge*4);splashMaterial.opacity=clamp(1-splashAge/.65,0,.8);if(splashAge>=.65)splashRing.visible=false}

class Player{
	root=new THREE.Group();velocity=new THREE.Vector3();onGround=true;swimming=false;
	private fallback:THREE.Group;private avatar:THREE.Group|null=null;private mixer:THREE.AnimationMixer|null=null;private actions=new Map<string,THREE.AnimationAction>();private activeAction:THREE.AnimationAction|null=null;private oneShot=false;
	private leftUpperArm:THREE.Object3D|null=null;private rightUpperArm:THREE.Object3D|null=null;private leftUpperLeg:THREE.Object3D|null=null;private rightUpperLeg:THREE.Object3D|null=null;
	private swimBlend=0;
	constructor(){
	 this.root.name='player-adventurer';this.fallback=new THREE.Group();this.fallback.name='player-fallback';
	 const mat=new THREE.MeshStandardMaterial({color:0x507486,roughness:.92});const body=new THREE.Mesh(new THREE.CapsuleGeometry(.25,.68,3,7),mat);body.position.y=.78;const head=new THREE.Mesh(new THREE.SphereGeometry(.19,8,6),mat);head.position.y=1.42;
	 for(const mesh of[body,head]){mesh.castShadow=!LOW_POWER_MODE;mesh.receiveShadow=true;this.fallback.add(mesh)}this.root.add(this.fallback);actors.add(this.root);
	 import('three/addons/loaders/GLTFLoader.js').then(({GLTFLoader})=>new GLTFLoader().load('/models/kenney-adventurer.glb',gltf=>{
	  const avatar=gltf.scene;avatar.name='kenney-human-adventurer';avatar.scale.setScalar(.45);
		 this.leftUpperArm=avatar.getObjectByName('LeftArm')??null;this.rightUpperArm=avatar.getObjectByName('RightArm')??null;this.leftUpperLeg=avatar.getObjectByName('LeftUpLeg')??null;this.rightUpperLeg=avatar.getObjectByName('RightUpLeg')??null;
	  avatar.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=!LOW_POWER_MODE;o.receiveShadow=true}});this.root.add(avatar);this.avatar=avatar;
	  this.fallback.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const list=Array.isArray(o.material)?o.material:[o.material];for(const m of list)m.dispose()}});this.root.remove(this.fallback);
	  this.mixer=new THREE.AnimationMixer(avatar);this.mixer.addEventListener('finished',event=>{if(event.action===this.activeAction){this.activeAction=null;this.oneShot=false}});
	  for(const clip of gltf.animations){const n=clip.name.toLowerCase(),key=n.startsWith('idle')?'Idle':n.startsWith('run')?'Run':n.startsWith('jump')?'Jump':null;if(key)this.actions.set(key,this.mixer.clipAction(clip))}
	  this.setAction('Idle',true,.01);
	 },undefined,error=>console.warn('Player model could not load; keeping the lightweight fallback.',error))).catch(error=>console.warn('Player model loader could not be imported; keeping the lightweight fallback.',error));
	}
	private setAction(name:string,loop:boolean,fade=.16){
	 const next=this.actions.get(name);if(!next||next===this.activeAction)return;
	 this.activeAction?.fadeOut(fade);next.reset();next.enabled=true;next.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);next.clampWhenFinished=!loop;next.fadeIn(fade).play();this.activeAction=next;
	}
	playJump(){
	 const next=this.actions.get('Jump');if(!next)return;this.activeAction?.fadeOut(.08);this.oneShot=true;next.reset();next.enabled=true;next.setLoop(THREE.LoopOnce,1);next.clampWhenFinished=true;next.fadeIn(.08).play();this.activeAction=next;
	}
	animate(t:number,moving:boolean,sprinting:boolean,swimming:boolean,dt:number){
		this.mixer?.update(dt);
		if(swimming&&this.oneShot){this.activeAction?.fadeOut(.1);this.activeAction=null;this.oneShot=false}
		if(!this.oneShot){const state=moving&&!swimming?'Run':'Idle';this.setAction(state,true);this.actions.get(state)?.setEffectiveTimeScale(state==='Run'?(sprinting?1:.61):1)}
		this.swimBlend=lerp(this.swimBlend,swimming?1:0,Math.min(1,dt*6));
		const stroke=moving?Math.sin(t*4.6)*.5*this.swimBlend:0;
		if(this.leftUpperArm){const arm=this.leftUpperArm.rotation;arm.set(lerp(arm.x-.65,-1.178-stroke,this.swimBlend),lerp(arm.y,0,this.swimBlend),lerp(arm.z,-Math.PI,this.swimBlend))}
		if(this.rightUpperArm){const arm=this.rightUpperArm.rotation;arm.set(lerp(arm.x+.65,2.749+stroke,this.swimBlend),lerp(arm.y,1.178,this.swimBlend),lerp(arm.z,Math.PI/2,this.swimBlend))}
		const kick=(moving ? .38 : .06)*this.swimBlend;if(this.leftUpperLeg)this.leftUpperLeg.rotation.x+=Math.sin(t*4.6)*kick;if(this.rightUpperLeg)this.rightUpperLeg.rotation.x+=Math.sin(t*4.6+Math.PI)*kick;
		if(this.avatar){const target=swimming?1.38:0;this.avatar.rotation.x=lerp(this.avatar.rotation.x,target,Math.min(1,dt*5));this.avatar.position.y=swimming?Math.sin(t*2.6)*.018:0}
	}
}
const player=new Player();
let fauna:WildlifeSystem|null=null;
function disposeWorldObjects(root:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;if(!isSharedAnimalAsset(o.geometry)&&!geometries.has(o.geometry)){geometries.add(o.geometry);o.geometry.dispose()}
  const list=Array.isArray(o.material)?o.material:[o.material];for(const material of list)if(material!==waterMaterial&&!isSharedAnimalAsset(material)&&!materials.has(material)){materials.add(material);material.dispose()}});
}

class Chunks{
	loaded=new Map<string,THREE.Group>();changes:Record<string,string[]>={};aimTargets=new Set<THREE.Object3D>();cameraBlockers=new Set<THREE.Object3D>();
	private indexChunk(g:THREE.Group){const targets:THREE.Object3D[]=[],blockers:THREE.Object3D[]=[];g.traverse(o=>{if(o.userData.resource||o.userData.interactable){targets.push(o);this.aimTargets.add(o)}if(o.userData.resource||o.name==='home'){blockers.push(o);this.cameraBlockers.add(o)}});g.userData.aimTargets=targets;g.userData.cameraBlockers=blockers}
	releaseChunk(g:THREE.Group){for(const o of(g.userData.aimTargets as THREE.Object3D[]||[]))this.aimTargets.delete(o);for(const o of(g.userData.cameraBlockers as THREE.Object3D[]||[]))this.cameraBlockers.delete(o);disposeWorldObjects(g)}
	unregisterObject(o:THREE.Object3D){this.aimTargets.delete(o);this.cameraBlockers.delete(o);if(aimCache===o){aimCache=null;aimTimer=0}disposeWorldObjects(o)}
	key(x:number,z:number){return`${x},${z}`}coord(v:number){return Math.floor(v/SIZE)}
 build(cx:number,cz:number,lod:number=0){
  const key=this.key(cx,cz),g=new THREE.Group();g.name=`chunk:${key}`;g.userData.lod=lod;
  // LOD 0 = high (near), 1 = medium, 2 = low (far)
  const segs = lod===0 ? 12 : lod===1 ? 6 : 3;
  const terrain=new THREE.PlaneGeometry(SIZE,SIZE,segs,segs);terrain.rotateX(-Math.PI/2);const pos=terrain.getAttribute('position');
  const colors=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){const lx=pos.getX(i)+cx*SIZE+SIZE/2,lz=pos.getZ(i)+cz*SIZE+SIZE/2;const h=terrainHeightAt(lx,lz);pos.setY(i,h);const c=terrainColorAt(h,lx,lz);colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b}
  terrain.setAttribute('color',new THREE.BufferAttribute(colors,3));terrain.computeVertexNormals();
  const ground=new THREE.Mesh(terrain,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));ground.position.set(cx*SIZE+SIZE/2,0,cz*SIZE+SIZE/2);ground.receiveShadow=lod===0;ground.name='terrain';g.add(ground);
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
  // Clip the surface to the actual submerged basin floor instead of drawing whole
  // rectangular cells whenever a single edge sample happens to be wet.
  const waterGroup=new THREE.Group();waterGroup.name='water';waterGroup.position.set(cx*SIZE,0,cz*SIZE);
  const waterSegs=lod===0?16:lod===1?8:4,step=SIZE/waterSegs,shallowWater=new THREE.Color(0x559c99),deepWater=new THREE.Color(0x174b73),waterColor=new THREE.Color();
  const waterPositions:number[]=[],waterColors:number[]=[],waterIndices:number[]=[];
  type WaterPoint={x:number;z:number;depth:number};
  const appendWaterTriangle=(triangle:WaterPoint[])=>{
   const clipped:WaterPoint[]=[];
   for(let i=0;i<3;i++){
    const previous=triangle[(i+2)%3],current=triangle[i],previousWet=previous.depth>0,currentWet=current.depth>0;
    if(previousWet!==currentWet){const t=previous.depth/(previous.depth-current.depth);clipped.push({x:previous.x+(current.x-previous.x)*t,z:previous.z+(current.z-previous.z)*t,depth:0})}
    if(currentWet)clipped.push(current);
   }
   if(clipped.length<3)return;
   const base=waterPositions.length/3;
   for(const point of clipped){waterPositions.push(point.x-cx*SIZE,WATER_LEVEL,point.z-cz*SIZE);waterColor.copy(shallowWater).lerp(deepWater,clamp(waterDepthAt(point.x,point.z)/3.2,0,1));waterColors.push(waterColor.r,waterColor.g,waterColor.b)}
   for(let i=1;i<clipped.length-1;i++)waterIndices.push(base,base+i,base+i+1);
  };
  for(let iz=0;iz<waterSegs;iz++)for(let ix=0;ix<waterSegs;ix++){
   const x0=cx*SIZE+ix*step,x1=x0+step,z0=cz*SIZE+iz*step,z1=z0+step;
   const p00={x:x0,z:z0,depth:waterDepthAt(x0,z0)},p10={x:x1,z:z0,depth:waterDepthAt(x1,z0)},p11={x:x1,z:z1,depth:waterDepthAt(x1,z1)},p01={x:x0,z:z1,depth:waterDepthAt(x0,z1)};
   appendWaterTriangle([p00,p01,p11]);appendWaterTriangle([p00,p11,p10]);
  }
  if(waterIndices.length){const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(waterPositions,3));geom.setAttribute('color',new THREE.Float32BufferAttribute(waterColors,3));geom.setIndex(waterIndices);geom.computeVertexNormals();const water=new THREE.Mesh(geom,waterMaterial);water.name='water-surface';waterGroup.add(water);g.add(waterGroup);g.userData.water=true}
  const removed=this.changes[key]||[];
  if(lod < 2){ // no trees/rocks on far LOD
    const maxTrees = lod===0 ? 9 : 4;
    for(let i=0;i<maxTrees;i++){
     if(hash(cx*17+i,cz*23-i)<=.56)continue;
     const tx=cx*SIZE+2+hash(cx+i,cz-i)*(SIZE-4),tz=cz*SIZE+2+hash(cx-i,cz+i)*(SIZE-4);
     if(roadAt(tx,tz)||waterAt(tx,tz)||nearHome(tx,tz))continue; // check the tree's own spot, not the chunk center
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
    const maxRocks = lod===0 ? 4 : 2;
    for(let i=0;i<maxRocks;i++){
     if(hash(cx*41+i*7,cz*47-i*5)<=.62)continue; // sparser than trees
     const tx=cx*SIZE+2+hash(cx-i*3,cz+i*5)*(SIZE-4),tz=cz*SIZE+2+hash(cx+i*5,cz-i*3)*(SIZE-4);
     if(roadAt(tx,tz)||waterAt(tx,tz)||nearHome(tx,tz))continue;
     const mtn=mountainMaskAt(tx,tz);
     if(mtn<.15&&hash(cx*3+i,cz*5-i)>.25)continue; // rocks cluster on mountains, rare scattered boulders in plains
     const kind:ResourceKind=mtn>.55&&hash(cx*13+i,cz*17-i)<.4?'boulder':'rock',def=RESOURCE_DEFS[kind],name=`rock-${i}`;
     const entry=removed.find(e=>e===name||e.startsWith(name+'@'));
     if(entry){ // rocks never regrow (regrowSeconds = Infinity), so a mined spot is permanent rubble
      const rubble=new THREE.Mesh(new THREE.CylinderGeometry(.28,.34,.12,6),new THREE.MeshStandardMaterial({color:0x5a5d60}));
      rubble.name=`rubble-${i}`;rubble.position.set(tx,terrainHeightAt(tx,tz)+.06,tz);
      if(lod===0){rubble.castShadow=true;rubble.receiveShadow=true}
      g.add(rubble);continue;
     }
     const rock=buildRock(kind,lod);rock.name=name;
     rock.userData.resource={kind,hits:def.hitsToFell,maxHits:def.hitsToFell};
     rock.userData.colliderRadius=def.colliderRadius;
     rock.position.set(tx,terrainHeightAt(tx,tz),tz);
     g.add(rock);
    }
  }
  fauna?.spawnChunk(cx,cz,lod,g);
  if(cx===0&&cz===0)this.home(g);this.indexChunk(g);world.add(g);this.loaded.set(key,g);
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
	for(const[k,g]of this.loaded){const[a,b]=k.split(',').map(Number);if(Math.abs(a-cx)>RADIUS||Math.abs(b-cz)>RADIUS){fauna?.removeChunk(k);this.releaseChunk(g);world.remove(g);this.loaded.delete(k)}}
  const minX=Math.max(-WORLD_RADIUS,cx-RADIUS),maxX=Math.min(WORLD_RADIUS,cx+RADIUS),minZ=Math.max(-WORLD_RADIUS,cz-RADIUS),maxZ=Math.min(WORLD_RADIUS,cz+RADIUS);
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
   const dist=Math.max(Math.abs(x-cx),Math.abs(z-cz));
   const lod=dist<=2?0:dist<=4?1:2;
   const key=this.key(x,z),existing=this.loaded.get(key);
   if(!existing){this.build(x,z,lod)}
	  else if(existing.userData.lod>lod){fauna?.removeChunk(key);this.releaseChunk(existing);world.remove(existing);this.loaded.delete(key);this.build(x,z,lod)} // upgrade detail as player gets closer
  }
 }
}
const chunks=new Chunks();
let save:Save={version:1,player:{x:0,y:0,z:5,ry:0,mode:'tpp'},camera:{yaw:0,pitch:-.28,distance:7},changes:{},inventory:{}};
try{const raw=localStorage.getItem(SAVE_KEY);if(raw)save=JSON.parse(raw)}catch{}
chunks.changes=save.changes;player.root.position.set(save.player.x,save.player.y,save.player.z);if(!Number.isFinite(player.root.position.y)||player.root.position.y<terrainHeightAt(player.root.position.x,player.root.position.z))player.root.position.y=terrainHeightAt(player.root.position.x,player.root.position.z);player.root.rotation.y=save.player.ry;
let mode:Mode=save.player.mode,camYaw=save.camera.yaw,camPitch=save.camera.pitch,camDistance=save.camera.distance,targetYaw=camYaw,targetPitch=camPitch,targetDistance=camDistance;
let inventory:Record<string,number>=save.inventory||{};
let worldTime=save.worldTime??9;
function saveNow(){save={version:1,player:{x:player.root.position.x,y:player.root.position.y,z:player.root.position.z,ry:player.root.rotation.y,mode},camera:{yaw:camYaw,pitch:camPitch,distance:camDistance},changes:chunks.changes,inventory,wildlifeTrust:fauna?.trust??save.wildlifeTrust??{},worldTime};localStorage.setItem(SAVE_KEY,JSON.stringify(save))}

const keys=new Set<string>();addEventListener('keydown',e=>{keys.add(e.key.toLowerCase());if(e.key.toLowerCase()==='f')mode='fpp';if(e.key.toLowerCase()==='c')mode='tpp';if(!e.repeat&&e.key.toLowerCase()==='e')interact()});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
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
function bindHoldAction(el:HTMLElement,key:string){const down=(e:PointerEvent)=>{e.preventDefault();e.stopPropagation();keys.add(key);el.setPointerCapture(e.pointerId)},up=()=>keys.delete(key);el.addEventListener('pointerdown',down);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up)}
bindAction(document.querySelector('#modeBtn') as HTMLButtonElement,()=>mode=mode==='tpp'?'fpp':'tpp');
bindAction(document.querySelector('#jumpBtn') as HTMLButtonElement,jump);
bindHoldAction(document.querySelector('#jumpBtn') as HTMLButtonElement,' ');
bindHoldAction(document.querySelector('#diveBtn') as HTMLButtonElement,'control');
bindAction(document.querySelector('#runBtn') as HTMLButtonElement,()=>sprintToggle=!sprintToggle);
bindAction(document.querySelector('#interactBtn') as HTMLButtonElement,interact);
const prompt=document.querySelector('#prompt') as HTMLDivElement,status=document.querySelector('#status')!,target=document.querySelector('#target') as HTMLDivElement,hud=document.querySelector('#hud') as HTMLDivElement,touchControls=document.querySelector('#touch') as HTMLDivElement;
const inventoryEl=document.querySelector('#inventory') as HTMLDivElement;
const compass=document.querySelector('#compass') as HTMLDivElement;
const mapOverlay=document.querySelector('#mapOverlay') as HTMLDivElement;
const mapCanvas=document.querySelector('#mapCanvas') as HTMLCanvasElement;const mapCtx=mapCanvas.getContext('2d')!;
const mapBtn=document.querySelector('#mapBtn') as HTMLButtonElement, mapClose=document.querySelector('#mapClose') as HTMLButtonElement;
function openMap(open:boolean){mapOverlay.classList.toggle('show',open);if(open){drawMap();drawAnimalMapMarkers();mapAccumulator=0}}
bindAction(mapBtn,()=>openMap(true));bindAction(mapClose,()=>openMap(false));
function drawMap(){const mapPixelRatio=Math.min(devicePixelRatio,LOW_POWER_MODE?1.25:1.5),w=mapCanvas.width=mapCanvas.clientWidth*mapPixelRatio,h=mapCanvas.height=mapCanvas.clientHeight*mapPixelRatio;mapCtx.setTransform(mapPixelRatio,0,0,mapPixelRatio,0,0);const cw=mapCanvas.clientWidth,ch=mapCanvas.clientHeight;mapCtx.clearRect(0,0,cw,ch);mapCtx.fillStyle='#18232b';mapCtx.fillRect(0,0,cw,ch);const pad=18,cell=Math.min((cw-pad*2)/WORLD_DIAMETER,(ch-pad*2)/WORLD_DIAMETER);for(let cz=-WORLD_RADIUS;cz<=WORLD_RADIUS;cz++)for(let cx=-WORLD_RADIUS;cx<=WORLD_RADIUS;cx++){const sx=pad+(cx+WORLD_RADIUS)*cell,sy=pad+(WORLD_RADIUS-cz)*cell;const road=roadAt(cx*SIZE+SIZE/2,cz*SIZE+SIZE/2),wx=cx*SIZE+SIZE/2,wz=cz*SIZE+SIZE/2;mapCtx.fillStyle=waterAt(wx,wz)?'#4b86a4':road?'#555b60':mountainMaskAt(wx,wz)>.4?'#8b8680':'#657f57';mapCtx.fillRect(sx,sy,Math.ceil(cell)+.5,Math.ceil(cell)+.5);if(road){mapCtx.fillStyle='#777b7e';if(Math.abs((((cx*SIZE+SIZE/2+ROAD_SPACING/2)%ROAD_SPACING)+ROAD_SPACING)%ROAD_SPACING-ROAD_SPACING/2)<ROAD_WIDTH/2)mapCtx.fillRect(sx+cell*.38,sy,cell*.24,cell);if(Math.abs((((cz*SIZE+SIZE/2+ROAD_SPACING/2)%ROAD_SPACING)+ROAD_SPACING)%ROAD_SPACING-ROAD_SPACING/2)<ROAD_WIDTH/2)mapCtx.fillRect(sx,sy+cell*.38,cell,cell*.24)}}const px=pad+(thisCoord(player.root.position.x)+WORLD_RADIUS+.5)*cell,py=pad+(WORLD_RADIUS-thisCoord(player.root.position.z)+.5)*cell;mapCtx.fillStyle='#fff';mapCtx.beginPath();mapCtx.arc(px,py,Math.max(4,cell*.32),0,Math.PI*2);mapCtx.fill();const hx=pad+(Math.floor(HOME_X/SIZE)+WORLD_RADIUS+.5)*cell,hy=pad+(WORLD_RADIUS-Math.floor(HOME_Z/SIZE)+.5)*cell;mapCtx.fillStyle='#f0c674';mapCtx.fillRect(hx-cell*.25,hy-cell*.25,cell*.5,cell*.5);mapCtx.strokeStyle='#ffffff66';mapCtx.strokeRect(pad,pad,WORLD_DIAMETER*cell,WORLD_DIAMETER*cell);}
function drawAnimalMapMarkers(){const cw=mapCanvas.clientWidth,ch=mapCanvas.clientHeight,pad=18,cell=Math.min((cw-pad*2)/WORLD_DIAMETER,(ch-pad*2)/WORLD_DIAMETER);for(const a of fauna?.markers()??[]){const x=pad+(a.x/SIZE+WORLD_RADIUS)*cell,y=pad+(WORLD_RADIUS-a.z/SIZE)*cell;mapCtx.fillStyle=speciesColor(a.species);mapCtx.strokeStyle='#10151b';mapCtx.lineWidth=1;mapCtx.beginPath();mapCtx.arc(x,y,Math.max(2.5,cell*.14),0,Math.PI*2);mapCtx.fill();mapCtx.stroke()}}

const fullscreenBtn=document.querySelector('#fullscreenBtn') as HTMLButtonElement;
function updateFullscreenButton(){fullscreenBtn.textContent=document.fullscreenElement?'⛶':'⛶';fullscreenBtn.title=document.fullscreenElement?'Exit fullscreen':'Fullscreen'}
fullscreenBtn.addEventListener('pointerdown',async e=>{e.preventDefault();e.stopPropagation();try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{}});
document.addEventListener('fullscreenchange',updateFullscreenButton);updateFullscreenButton();
let promptTimer=0,sprintToggle=false,mapAccumulator=0,uiAccumulator=0;
function say(t:string){prompt.textContent=t;prompt.classList.add('show');promptTimer=1.2}
function jump(){if(player.swimming){player.velocity.y=1.8;return}if(player.onGround){player.velocity.y=7.2;player.onGround=false;player.playJump()}}
function addItem(item:string,qty:number){inventory[item]=(inventory[item]||0)+qty;renderInventory();saveNow()}
function renderInventory(){inventoryEl.innerHTML=Object.entries(inventory).filter(([,v])=>v>0).map(([k,v])=>`<span class="invItem">${ITEM_ICONS[k]||'•'} ${v}</span>`).join('')}
renderInventory();
fauna=new WildlifeSystem({heightAt:terrainHeightAt,waterAt,roadAt,nearHome,biomeAt,trust:save.wildlifeTrust??{},hasFruit:()=>Boolean(inventory.Fruit),consumeFruit:()=>{inventory.Fruit=Math.max(0,(inventory.Fruit||0)-1);renderInventory();saveNow()},onTrustChange:saveNow,notify:say});
chunks.stream(save.player.x,save.player.z);
function hitResource(obj:THREE.Object3D){
 const res=obj.userData.resource as {kind:ResourceKind;hits:number;maxHits:number};
 const def=RESOURCE_DEFS[res.kind];
 res.hits--;
 obj.scale.setScalar(Math.max(.7,1-.08*(res.maxHits-res.hits)));
 if(res.hits>0){say(`Hit ${res.kind} (${res.maxHits-res.hits}/${res.maxHits})`);return}
 const roll=hash(Math.round(obj.position.x*97),Math.round(obj.position.z*131));
 const qty=def.yieldQty[0]+Math.floor(roll*(def.yieldQty[1]-def.yieldQty[0]+1));
 addItem(def.yieldItem,qty);
 let msg=`Harvested ${qty} ${def.yieldItem}`;
 if(def.bonusItem&&def.bonusQty){const bq=def.bonusQty[0]+Math.floor(hash(Math.round(obj.position.z*97),Math.round(obj.position.x*131))*(def.bonusQty[1]-def.bonusQty[0]+1));addItem(def.bonusItem,bq);msg+=` + ${bq} ${def.bonusItem}`}
 const q=obj.getWorldPosition(new THREE.Vector3()),cx=chunks.coord(q.x),cz=chunks.coord(q.z),key=chunks.key(cx,cz),g=chunks.loaded.get(key);
 if(g){
  chunks.changes[key]??=[];chunks.changes[key].push(`${obj.name}@${Date.now()}`);
  chunks.unregisterObject(obj);g.remove(obj);
  if(def.family==='tree'){
   const stump=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,.28,6),new THREE.MeshStandardMaterial({color:0x5c4028}));
   stump.name=obj.name.replace('tree-','stump-');stump.position.copy(obj.position);stump.position.y+=.14;stump.castShadow=true;stump.receiveShadow=true;g.add(stump);
  }else{
   const rubble=new THREE.Mesh(new THREE.CylinderGeometry(.28,.34,.12,6),new THREE.MeshStandardMaterial({color:0x5a5d60}));
   rubble.name=obj.name.replace('rock-','rubble-');rubble.position.copy(obj.position);rubble.position.y+=.06;rubble.castShadow=true;rubble.receiveShadow=true;g.add(rubble);
  }
 }
 say(msg);saveNow();
}
const aimRay=new THREE.Raycaster(),cameraRay=new THREE.Raycaster(),aimNdc=new THREE.Vector2(),aimObjects:THREE.Object3D[]=[],aimHits:THREE.Intersection[]=[];let aimCache:THREE.Object3D|null=null,aimTimer=0;
function getAimTarget(force=false):THREE.Object3D|null{
 if(!force&&aimTimer>0)return aimCache;
 aimTimer=LOW_POWER_MODE?.12:.06;aimRay.setFromCamera(aimNdc.set(0,mode==='tpp'?.15:0),camera);aimObjects.length=0;for(const o of chunks.aimTargets)aimObjects.push(o);aimHits.length=0;
 const hit=aimRay.intersectObjects(aimObjects,true,aimHits)[0];if(!hit||hit.distance>3.5)return aimCache=null;let o=hit.object;
 while(o.parent&&o.parent!==world&&!o.userData.resource&&!o.userData.interactable)o=o.parent;
 return aimCache=o;
}
function interact(){
 const o=getAimTarget(true);if(!o){say('Aim at something within reach');return}
 if(o.userData.animal){fauna?.interact(o);return}
 if(o.userData.resource){hitResource(o);return}
 const data=o.userData.interactable as {action:string;label:string}|undefined;if(!data){say('Nothing to use here');return}
 if(data.action==='toggleDoor'){const h=chunks.loaded.get('0,0')?.getObjectByName('home') as THREE.Group|null;if(!h){say('Door unavailable');return}const open=!Boolean(h.userData.doorOpen);h.userData.doorOpen=open;const changes=chunks.changes['0,0']??(chunks.changes['0,0']=[]),i=changes.indexOf('door-open');if(open&&i<0)changes.push('door-open');if(!open&&i>=0)changes.splice(i,1);o.rotation.y=open?-Math.PI/2:0;saveNow();say(open?'Door opened':'Door closed');return}
 if(data.action==='rest'){say('Bed — rest system attaches here');return}
 say(`USE · ${data.label}`)
}

const clock=new THREE.Clock();let autosave=0,lastCx=999,lastCz=999,walkTime=0;
function thisCoord(v:number){return Math.floor(v/SIZE)}
function canOccupy(x:number,z:number){
 const playerRadius=.34;if(Math.abs(thisCoord(x))>WORLD_RADIUS||Math.abs(thisCoord(z))>WORLD_RADIUS)return false;
 const pcx=chunks.coord(x),pcz=chunks.coord(z);
 for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){const g=chunks.loaded.get(chunks.key(pcx+ox,pcz+oz));if(!g)continue;
  const home=g.getObjectByName('home') as THREE.Group|null;const box=home?.userData.collider as {minX:number;maxX:number;minZ:number;maxZ:number;doorMinX:number;doorMaxX:number;wallThickness:number}|undefined;
  if(box&&home){const inside=x+playerRadius>box.minX&&x-playerRadius<box.maxX&&z+playerRadius>box.minZ&&z-playerRadius<box.maxZ;if(inside){const nearLeft=x-box.minX<box.wallThickness+playerRadius,nearRight=box.maxX-x<box.wallThickness+playerRadius,nearBack=z-box.minZ<box.wallThickness+playerRadius,nearFront=box.maxZ-z<box.wallThickness+playerRadius,doorOpen=Boolean(home.userData.doorOpen),inDoor=doorOpen&&x>box.doorMinX-playerRadius&&x<box.doorMaxX+playerRadius;if(nearLeft||nearRight||nearBack||(nearFront&&!inDoor))return false}}
  for(const o of g.children){const r=o.userData.colliderRadius as number|undefined;if(!r)continue;const rr=r+playerRadius,dx=x-o.position.x,dz=z-o.position.z;if(dx*dx+dz*dz<rr*rr)return false}
 }return true
}
function moveWithCollisions(dx:number,dz:number){
 const p=player.root.position;
 const nx=p.x+dx,nz=p.z+dz;
 if(canOccupy(nx,nz)){p.x=nx;p.z=nz;return}
 if(canOccupy(nx,p.z))p.x=nx;
 if(canOccupy(p.x,nz))p.z=nz;
}

const moveForward=new THREE.Vector3(),moveRight=new THREE.Vector3(),moveDirection=new THREE.Vector3(),cameraFocus=new THREE.Vector3(),cameraPosition=new THREE.Vector3(),cameraDirection=new THREE.Vector3(),cameraEye=new THREE.Vector3(),cameraLook=new THREE.Vector3(),cameraBlockerObjects:THREE.Object3D[]=[],cameraHits:THREE.Intersection[]=[];let cameraProbeTimer=0,cameraClearance=camDistance;
function input(){let x=joy.x,y=joy.y;if(keys.has('a')||keys.has('arrowleft'))x-=1;if(keys.has('d')||keys.has('arrowright'))x+=1;if(keys.has('w')||keys.has('arrowup'))y-=1;if(keys.has('s')||keys.has('arrowdown'))y+=1;const l=Math.hypot(x,y);return l>1?{x:x/l,y:y/l}:{x,y}}
function update(dt:number){
	if(waterShader)waterShader.uniforms.uTime.value+=dt;updateSplash(dt);aimTimer=Math.max(0,aimTimer-dt);worldTime=(worldTime+dt*.05)%24;updateSky(dt);
	const wasSwimming=player.swimming,p=player.root.position;
	player.swimming=waterAt(p.x,p.z)&&WATER_LEVEL-terrainHeightAt(p.x,p.z)>.65;
		const iv=input();
		const forward=moveForward.set(Math.sin(camYaw),0,Math.cos(camYaw)),right=moveRight.set(-Math.cos(camYaw),0,Math.sin(camYaw));
		const dir=moveDirection.set(0,0,0).addScaledVector(right,iv.x).addScaledVector(forward,-iv.y);
		const inputMagnitude=Math.min(1,dir.length()),hasInput=inputMagnitude>.08,sprinting=(keys.has('shift')||sprintToggle)&&hasInput;
		if(hasInput){const desired=Math.atan2(dir.x,dir.z),speed=player.swimming?(sprinting?2.05:1.4):(sprinting?7.4:4.5),targetSpeed=speed*inputMagnitude,response=1-Math.exp(-(player.swimming?5:14)*dt);player.velocity.x=lerp(player.velocity.x,Math.sin(desired)*targetSpeed,response);player.velocity.z=lerp(player.velocity.z,Math.cos(desired)*targetSpeed,response)}
		else{const response=1-Math.exp(-(player.swimming?3.8:11)*dt);player.velocity.x=lerp(player.velocity.x,0,response);player.velocity.z=lerp(player.velocity.z,0,response)}
		const horizontalSpeed=Math.hypot(player.velocity.x,player.velocity.z),moving=hasInput||horizontalSpeed>(player.swimming ? .08 : .16);if(horizontalSpeed>.05){const desired=Math.atan2(player.velocity.x,player.velocity.z);player.root.rotation.y=angleLerp(player.root.rotation.y,desired,Math.min(1,dt*(player.swimming?5:9)))}
		if(keys.has(' ')&&!player.swimming&&player.onGround)jump();
	moveWithCollisions(player.velocity.x*dt,player.velocity.z*dt);
	player.swimming=waterAt(p.x,p.z)&&WATER_LEVEL-terrainHeightAt(p.x,p.z)>.65;
	if(player.swimming){
	 const bedY=terrainHeightAt(p.x,p.z),minY=bedY+.22,maxY=keys.has(' ')?WATER_LEVEL+.22:WATER_LEVEL-.08;
	 const targetY=keys.has('control')?WATER_LEVEL-1.9:keys.has(' ')?WATER_LEVEL+.14:WATER_LEVEL-.08;
	 const buoyancyTarget=clamp(targetY,minY,maxY);player.velocity.y=lerp(player.velocity.y,(buoyancyTarget-p.y)*4,Math.min(1,dt*3.5));p.y=clamp(p.y+player.velocity.y*dt,minY,maxY);player.onGround=false;
	}else{
	 player.velocity.y-=18*dt;p.y+=player.velocity.y*dt;
	 let groundY=terrainHeightAt(p.x,p.z);const home=chunks.loaded.get('0,0')?.getObjectByName('home') as THREE.Group|undefined;
	 if(home){const box=home.userData.collider;if(box&&p.x>box.minX&&p.x<box.maxX&&p.z>box.minZ&&p.z<box.maxZ)groundY=Math.max(groundY,home.position.y+0.18)}
	 if(p.y<=groundY){p.y=groundY;player.velocity.y=0;player.onGround=true}else player.onGround=false;
	}
	const cx=chunks.coord(p.x),cz=chunks.coord(p.z);if(cx!==lastCx||cz!==lastCz){chunks.stream(p.x,p.z);lastCx=cx;lastCz=cz}
	if(player.swimming!==wasSwimming){hud.classList.toggle('swimming',player.swimming);touchControls.classList.toggle('swimming',player.swimming);waterSplash(p.x,p.z);say(player.swimming?'Swimming · hold Space / RISE to surface; Ctrl / DIVE to submerge.':'Back on land.');}
	fauna?.update(dt,p,sprinting);
	camYaw=angleLerp(camYaw,targetYaw,Math.min(1,dt*12));camPitch=lerp(camPitch,targetPitch,Math.min(1,dt*12));camDistance=lerp(camDistance,targetDistance,Math.min(1,dt*12));player.root.visible=mode!=='fpp';
	const focus=cameraFocus.copy(p);focus.y+=player.swimming?.28:1.05;
	if(mode==='tpp'){cameraProbeTimer-=dt;if(cameraProbeTimer<=0){cameraProbeTimer=LOW_POWER_MODE?.12:.075;cameraBlockerObjects.length=0;for(const o of chunks.cameraBlockers)cameraBlockerObjects.push(o);const pcx=chunks.coord(p.x),pcz=chunks.coord(p.z);for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){const terrain=chunks.loaded.get(chunks.key(pcx+ox,pcz+oz))?.getObjectByName('terrain');if(terrain)cameraBlockerObjects.push(terrain)}cameraDirection.set(-Math.sin(camYaw)*Math.cos(camPitch),Math.sin(camPitch),-Math.cos(camYaw)*Math.cos(camPitch));cameraRay.near=0;cameraRay.far=camDistance;cameraRay.set(focus,cameraDirection);cameraHits.length=0;const hit=cameraRay.intersectObjects(cameraBlockerObjects,true,cameraHits)[0];cameraClearance=hit?Math.max(1.35,hit.distance-.25):camDistance}const distance=Math.min(camDistance,cameraClearance),h=Math.cos(camPitch)*distance,pos=cameraPosition.copy(focus);pos.x-=Math.sin(camYaw)*h;pos.y+=Math.sin(camPitch)*distance;pos.z-=Math.cos(camYaw)*h;if(player.swimming&&!keys.has('control'))pos.y=Math.max(pos.y,WATER_LEVEL+.8);camera.position.lerp(pos,Math.min(1,dt*14));camera.lookAt(focus)}
	else{const eye=cameraEye.copy(p);eye.y+=player.swimming?.22:1.55;camera.position.lerp(eye,Math.min(1,dt*18));const look=cameraLook.copy(eye);look.x+=Math.sin(targetYaw)*Math.cos(targetPitch)*8;look.y+=Math.sin(targetPitch)*8;look.z+=Math.cos(targetYaw)*Math.cos(targetPitch)*8;camera.lookAt(look)}
	const cameraUnderwater=player.swimming&&camera.position.y<WATER_LEVEL-.04;if(cameraUnderwater!==underwater){underwater=cameraUnderwater;hud.classList.toggle('underwater',underwater);if(scene.fog){const fog=scene.fog as THREE.Fog;fog.color.copy(underwater?underwaterFogColor:skyColor);fog.near=underwater?1.5:60;fog.far=underwater?18:160}}
	player.animate(walkTime+=dt,moving,sprinting,player.swimming,dt);
	const aimed=getAimTarget();if(aimed&&!moving&&!promptTimer){const r=aimed.userData.resource as {kind:string;hits:number;maxHits:number}|undefined,animal=aimed.userData.animal as {species:string}|undefined;say(animal?`E · observe ${animal.species}${inventory.Fruit?' or offer fruit':''}`:r?`USE · ${r.kind[0].toUpperCase()+r.kind.slice(1)} (${r.maxHits-r.hits}/${r.maxHits})`:`USE · ${aimed.name.replace('front-door','Front door').replace('tree-','Tree ')}`)}
	if(promptTimer>0){promptTimer-=dt;if(promptTimer<=0)prompt.classList.remove('show')}
	compass.style.transform=`translateX(-50%) rotate(${-camYaw*180/Math.PI}deg)`;if(mapOverlay.classList.contains('show')){mapAccumulator+=dt;if(mapAccumulator>=.25){drawMap();drawAnimalMapMarkers();mapAccumulator=0}}else mapAccumulator=0;
	autosave+=dt;if(autosave>2){autosave=0;saveNow()}uiAccumulator+=dt;if(uiAccumulator>=.1){uiAccumulator=0;target.style.top=mode==='tpp'?'40%':'50%';target.classList.toggle('active',!!aimed);target.textContent=aimed?(aimed.userData.resource?'✚':'•'):'✚';(document.querySelector('#modeBtn') as HTMLButtonElement).textContent=mode.toUpperCase();(document.querySelector('#runBtn') as HTMLButtonElement).textContent=sprintToggle?'RUN':'WALK';(document.querySelector('#jumpBtn') as HTMLButtonElement).textContent=player.swimming?'RISE':'JUMP';const hour=Math.floor(worldTime),minute=Math.floor((worldTime-hour)*60);status.textContent=`${player.swimming?'SWIM':mode.toUpperCase()} · ${sprinting?'RUN':'WALK'} · ${biomeAt(p.x,p.z)} · ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} · chunk ${cx},${cz}`;(document.querySelector('#wildlife') as HTMLElement).textContent=fauna?.status(p)??'Wildlife loading…'}
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,LOW_POWER_MODE?1.25:1.65));renderer.setSize(innerWidth,innerHeight)});
addEventListener('beforeunload',saveNow);
function loop(){requestAnimationFrame(loop);update(Math.min(clock.getDelta(),.05));renderer.render(scene,camera)}loop();
