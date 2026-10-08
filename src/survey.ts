import * as THREE from 'three';
import { SIZE, WORLD_RADIUS, terrainHeightAt, terrainSlopeAt, waterDepthAt, waterSurfaceAt, waterFlowAt } from './world';

export type SurveyView = 'world' | 'terrain' | 'hydrology';

const MIN = -WORLD_RADIUS * SIZE;
const MAX = (WORLD_RADIUS + 1) * SIZE;
const SPAN = MAX - MIN;
const CENTER = (MIN + MAX) * 0.5;

export class WorldSurvey {
  readonly root = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.2, 2200);
  private readonly terrain: THREE.Mesh;
  private readonly water: THREE.Mesh;
  private readonly flow: THREE.LineSegments;
  private readonly border: THREE.LineLoop;
  private readonly terrainGeo: THREE.BufferGeometry;
  private readonly waterGeo: THREE.BufferGeometry;
  private readonly flowGeo: THREE.BufferGeometry;
  private view: SurveyView = 'world';
  private active = false;
  private target = new THREE.Vector3(CENTER, 0, CENTER);
  private goal = this.target.clone();
  private yaw = 0.72;
  private pitch = -1.12;
  private distance = 720;
  private distanceGoal = 720;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
private worldScene: THREE.Scene | null = null;
private worldCamera: THREE.Camera | null = null;
private surveyScene = new THREE.Scene();

  constructor() {
    this.root.name = 'world-survey';
    this.root.visible = false;

    const n = 128;
    const positions: number[] = [];
    const colors: number[] = [];
    for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
      const wx = THREE.MathUtils.lerp(MIN, MAX, x / n);
      const wz = THREE.MathUtils.lerp(MIN, MAX, z / n);
      const h = terrainHeightAt(wx, wz);
      const slope = terrainSlopeAt(wx, wz, 1.6).slope;
      const hi = THREE.MathUtils.clamp((h + 4) / 110, 0, 1);
      const st = THREE.MathUtils.clamp(slope / 1.05, 0, 1);
      positions.push(wx, h, wz);
      colors.push(0.20 + hi * 0.43 + st * 0.12, 0.22 + hi * 0.41 + st * 0.10, 0.24 + hi * 0.38 + st * 0.08);
    }
    const indices: number[] = [];
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const a = z * (n + 1) + x, b = a + 1, c = a + n + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    this.terrainGeo = new THREE.BufferGeometry();
    this.terrainGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.terrainGeo.setIndex(indices);
    this.terrainGeo.computeVertexNormals();
    this.terrain = new THREE.Mesh(this.terrainGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.terrain.name = 'survey-terrain-topology';
    this.terrain.frustumCulled = false;
    this.root.add(this.terrain);

    const wp: number[] = [], wc: number[] = [], wi: number[] = [];
    const grid = 128, cell = SPAN / grid;
    for (let z = 0; z < grid; z++) for (let x = 0; x < grid; x++) {
      const x0 = MIN + x * cell, z0 = MIN + z * cell;
      const pts: [number, number][] = [[x0,z0],[x0+cell,z0],[x0,z0+cell],[x0+cell,z0+cell]];
      const depths = pts.map(p => waterDepthAt(p[0], p[1]));
      if (Math.max(...depths) <= 0.015) continue;
      const base = wp.length / 3;
      pts.forEach((p, i) => {
        const d = depths[i], s = waterSurfaceAt(p[0], p[1]) + 0.035;
        wp.push(p[0], s, p[1]);
        const ocean = waterFlowAt(p[0], p[1]).waterType === 'ocean';
        const deep = THREE.MathUtils.clamp(d / 4, 0, 1);
        wc.push(ocean ? 0.08 : 0.04, ocean ? 0.50 + deep * 0.18 : 0.70 + deep * 0.14, ocean ? 0.76 + deep * 0.12 : 0.82 + deep * 0.12);
      });
      wi.push(base,base+2,base+1,base+1,base+2,base+3);
    }
    this.waterGeo = new THREE.BufferGeometry();
    this.waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(wp,3));
    this.waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(wc,3));
    this.waterGeo.setIndex(wi);
    this.waterGeo.computeVertexNormals();
    this.water = new THREE.Mesh(this.waterGeo, new THREE.MeshBasicMaterial({ vertexColors:true, transparent:true, opacity:0.95, depthWrite:true, side:THREE.DoubleSide }));
    this.water.name = 'survey-water-truth';
    this.water.frustumCulled = false;
    this.root.add(this.water);

    const fp: number[] = [], fc: number[] = [], step = 4;
    for (let z = 0; z < grid; z += step) for (let x = 0; x < grid; x += step) {
      const wx = MIN + (x + 0.5) * cell, wz = MIN + (z + 0.5) * cell, d = waterDepthAt(wx,wz);
      if (d <= 0.04) continue;
      const f = waterFlowAt(wx,wz);
      if (f.waterType === 'ocean' || f.waterType === 'lake' || f.flowSpeed < 0.08) continue;
      const len = THREE.MathUtils.clamp(1.6 + f.flowSpeed * 0.8, 1.8, 5);
      const y = waterSurfaceAt(wx,wz) + 0.12, ex = wx + f.flowVector.x * len, ez = wz + f.flowVector.y * len;
      const sx = -f.flowVector.y, sz = f.flowVector.x, head = Math.min(0.75, len * 0.25);
      fp.push(wx,y,wz,ex,y+0.01,ez, ex,y+0.01,ez, ex-f.flowVector.x*head+sx*head*.55,y+0.01,ez-f.flowVector.y*head+sz*head*.55, ex,y+0.01,ez, ex-f.flowVector.x*head-sx*head*.55,y+0.01,ez-f.flowVector.y*head-sz*head*.55);
      for(let i=0;i<6;i++) fc.push(0.95,0.72,0.20);
    }
    this.flowGeo = new THREE.BufferGeometry();
    this.flowGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp,3));
    this.flowGeo.setAttribute('color', new THREE.Float32BufferAttribute(fc,3));
    this.flow = new THREE.LineSegments(this.flowGeo, new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0.95}));
    this.root.add(this.flow);

    const borderGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(MIN,.18,MIN),new THREE.Vector3(MAX,.18,MIN),new THREE.Vector3(MAX,.18,MAX),new THREE.Vector3(MIN,.18,MAX)
    ]);
    this.border = new THREE.LineLoop(borderGeo,new THREE.LineBasicMaterial({color:0xff5f56,transparent:true,opacity:.9}));
    this.root.add(this.border);
    this.setView('world');
    this.applyCamera();
  }

  setWorldScene(scene: THREE.Scene, camera: THREE.Camera) {
    this.worldScene = scene;
    this.worldCamera = camera;
  }
  get isActive(){ return this.active; }
  get currentView(){ return this.view; }
  setActive(active:boolean){ this.active=active; this.root.visible=active; if(active){this.distanceGoal=Math.max(this.distanceGoal,SPAN*1.18);this.applyCamera();} }
  setView(view:SurveyView){
    this.view=view;
    this.flow.visible=view==='hydrology';
    this.terrain.visible=view!=='world';
    this.water.visible=view!=='world';
    this.border.visible=view!=='world';
    if (view === 'world') {
      this.surveyScene.clear();
    }
    const c=this.terrainGeo.getAttribute('color').array as Float32Array, n=128;
    for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){
      const i=(z*(n+1)+x)*3;
      const wx=THREE.MathUtils.lerp(MIN,MAX,x/n),wz=THREE.MathUtils.lerp(MIN,MAX,z/n);
      const h=terrainHeightAt(wx,wz),s=THREE.MathUtils.clamp(terrainSlopeAt(wx,wz,1.6).slope/1.05,0,1),hi=THREE.MathUtils.clamp((h+4)/110,0,1);
      if(view==='hydrology'){c[i]=.16;c[i+1]=.18;c[i+2]=.21;}
      else {c[i]=.20+hi*.43+s*.12;c[i+1]=.22+hi*.41+s*.10;c[i+2]=.24+hi*.38+s*.08;}
    }
    this.terrainGeo.getAttribute('color').needsUpdate=true;
  }
  resize(aspect:number){this.camera.aspect=aspect;this.camera.updateProjectionMatrix();}
  zoom(amount:number){this.distanceGoal=THREE.MathUtils.clamp(this.distanceGoal*Math.exp(amount*.0022),7,980);}
  pan(dx:number,dy:number){
    const scale=this.distanceGoal*.00125;
    this.goal.x-=Math.cos(this.yaw)*dx*scale; this.goal.z+=Math.sin(this.yaw)*dx*scale;
    this.goal.x+=Math.sin(this.yaw)*dy*scale; this.goal.z+=Math.cos(this.yaw)*dy*scale;
    this.clampTarget();
  }
  orbit(dx:number,dy:number){this.yaw-=dx*.006;this.pitch=THREE.MathUtils.clamp(this.pitch-dy*.004,-1.48,-.28);}
  focusScreen(clientX:number,clientY:number,rect:DOMRect){
    this.ndc.set((clientX-rect.left)/rect.width*2-1,-((clientY-rect.top)/rect.height)*2+1);
    this.raycaster.setFromCamera(this.ndc,this.camera);
    if(this.raycaster.ray.intersectPlane(this.plane,this.hit)){this.goal.x=THREE.MathUtils.clamp(this.hit.x,MIN,MAX);this.goal.z=THREE.MathUtils.clamp(this.hit.z,MIN,MAX);}
  }
  update(dt:number){if(!this.active)return;const t=1-Math.exp(-dt*10);this.target.lerp(this.goal,t);this.distance+=(this.distanceGoal-this.distance)*t;this.applyCamera();}
  private clampTarget(){this.goal.x=THREE.MathUtils.clamp(this.goal.x,MIN+8,MAX-8);this.goal.z=THREE.MathUtils.clamp(this.goal.z,MIN+8,MAX-8);}
  private applyCamera(){const h=Math.cos(this.pitch)*this.distance;this.camera.position.set(this.target.x+Math.sin(this.yaw)*h,this.target.y-Math.sin(this.pitch)*this.distance,this.target.z+Math.cos(this.yaw)*h);this.camera.lookAt(this.target.x,0,this.target.z);this.camera.updateMatrixWorld();}
  capture(renderer:THREE.WebGLRenderer,width:number,height:number):string{
    if(Math.max(width,height)>3840)throw new Error('Survey capture is limited to 3840px.');
    const target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:true,stencilBuffer:false});
    const previous=renderer.getRenderTarget(), xr=renderer.xr.enabled, aspect=this.camera.aspect;
    try{
      this.camera.aspect=width/height;this.camera.updateProjectionMatrix();renderer.xr.enabled=false;renderer.setRenderTarget(target);
      if(this.view==='world' && this.worldScene) renderer.render(this.worldScene,this.camera);
      else renderer.render(this.root,this.camera);
      const pixels=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas 2D unavailable.');
      const image=ctx.createImageData(width,height),row=width*4;
      for(let y=0;y<height;y++)image.data.set(pixels.subarray((height-1-y)*row,(height-y)*row),y*row);
      ctx.putImageData(image,0,0);return canvas.toDataURL('image/png');
    }finally{renderer.setRenderTarget(previous);renderer.xr.enabled=xr;this.camera.aspect=aspect;this.camera.updateProjectionMatrix();target.dispose();}
  }
  dispose(){this.terrainGeo.dispose();this.waterGeo.dispose();this.flowGeo.dispose();[this.terrain,this.water,this.flow,this.border].forEach((o:any)=>{const m=o.material;if(Array.isArray(m))m.forEach((x:THREE.Material)=>x.dispose());else m.dispose();});}
}
