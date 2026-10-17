import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAlgae, addAlgaeFilm } from './algae.js';
export async function createWorld(canvas, progress) {
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.38;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();const fogColor=new THREE.Color('#103e59');scene.background=fogColor;scene.fog=new THREE.FogExp2(fogColor,0.014);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.12,300);camera.rotation.order='YXZ';
scene.add(new THREE.HemisphereLight(0x7cbed6,0x15222d,1.15));
const sun=new THREE.DirectionalLight(0xc6eaff,4.3);sun.position.set(-25,55,15);sun.target.position.set(0,0,-15);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-64,right:64,top:64,bottom:-64,near:1,far:150});sun.shadow.bias=-.0003;sun.shadow.normalBias=.08;sun.shadow.radius=2;scene.add(sun,sun.target);
const rim=new THREE.DirectionalLight(0x297ac0,1.25);rim.position.set(20,20,-50);scene.add(rim);
const fill=new THREE.DirectionalLight(0x80afb9,.4);fill.position.set(0,15,35);scene.add(fill);
let manifest,elapsed=0,ready=false,plumesEnabled=true,particlesEnabled=true,highQuality=true;
const shaderTime={value:0},waterFog={value:0.014};
const algaeGrowthUniform={value:0};
const shaders=[];
function caustics(material){
  if(!material?.isMeshStandardMaterial)return;
  material.side=THREE.FrontSide;
  material.onBeforeCompile=s=>{
    s.uniforms.oceanTime=shaderTime;
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vOceanWorld;');
    s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 oceanPos=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
      oceanPos=instanceMatrix*oceanPos;
      #endif
      vOceanWorld=(modelMatrix*oceanPos).xyz;`);
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float oceanTime; varying vec3 vOceanWorld;');
    s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,.7);');
    s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec2 cp=vOceanWorld.xz*.95;
      float cw=sin(cp.x+sin(cp.y*1.31+oceanTime*.24))+sin(cp.y*1.12+sin(cp.x*1.47-oceanTime*.19));
      float c=pow(1.-abs(cw)*.5,18.);
      float top=max(0.,normal.y*.7+.3);
      totalEmissiveRadiance+=vec3(.06,.15,.19)*c*top*.18;
    `);shaders.push(s);
  };
}

// Convert Blender linked meshes into native GPU instances, retaining all transforms.
function batchStatic(root){
  root.updateMatrixWorld(true);const groups=new Map();const materials=new Set();
  root.traverse(o=>{if(o.isMesh){const k=o.geometry.uuid+'|'+o.material.uuid; if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o);materials.add(o.material);}});
  const rockMaterials=new Set();root.traverse(o=>{if(o.isMesh&&/^Rock_/.test(o.name))rockMaterials.add(o.material);});
  for(const mat of materials){caustics(mat);if(rockMaterials.has(mat))addAlgaeFilm(mat,algaeGrowthUniform);for(const key of ['map','normalMap','roughnessMap','metalnessMap'])if(mat[key])mat[key].anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  for(const meshes of groups.values()){
    const first=meshes[0];
    if(meshes.length>1){const inst=new THREE.InstancedMesh(first.geometry,first.material,meshes.length);inst.name=first.name+'_BATCH';meshes.forEach((o,i)=>inst.setMatrixAt(i,o.matrixWorld));inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();inst.castShadow=!first.name.startsWith('Gravel');inst.receiveShadow=true;scene.add(inst);}
    else{const mesh=new THREE.Mesh(first.geometry,first.material);mesh.name=first.name;mesh.applyMatrix4(first.matrixWorld);mesh.castShadow=!first.name.startsWith('Seafloor');mesh.receiveShadow=true;scene.add(mesh);}
  }
}

const hashGLSL=`float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise3(p)*.57+noise3(p*2.03)*.28+noise3(p*4.01)*.15;}`;

function makeWater(){
  const mat=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false,uniforms:{uTime:shaderTime,uFogColor:{value:fogColor}},vertexShader:`varying vec3 w;uniform float uTime;void main(){vec3 p=position;p.y+=sin(p.x*.12+uTime*.3)*.22+sin(p.z*.17-uTime*.2)*.18;w=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`varying vec3 w;uniform float uTime;uniform vec3 uFogColor;${hashGLSL}
    float wave(vec2 p){return fbm(vec3(p*vec2(.7,1.7),uTime*.18))+.22*noise3(vec3(p*vec2(2.,4.8),uTime*.25));}
    void main(){vec2 q=w.xz;q*=.42;float n=wave(q);float nx=wave(q+vec2(.045,0.));float nz=wave(q+vec2(0.,.045));vec3 normal=normalize(vec3((nx-n)*20.,-1.,(nz-n)*20.));vec3 view=normalize(cameraPosition-w);vec3 light=normalize(vec3(-.22,-1.,.1));float spec=pow(max(0.,dot(reflect(-light,normal),view)),55.);float glow=exp(-length(w.xz-vec2(-12.,-12.))*.028);float crest=pow(max(0.,1.-abs(n-.53)*6.),9.);vec3 col=mix(vec3(.008,.035,.065),vec3(.12,.45,.6),glow);col+=vec3(.35,.7,.85)*(spec*2.8+crest*.06)*(.04+glow*glow);float farFade=smoothstep(50.,175.,distance(cameraPosition,w));gl_FragColor=vec4(col,1.-farFade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
  const geo=new THREE.PlaneGeometry(2000,2000,120,120);geo.rotateX(-Math.PI/2);geo.translate(0,55,0);const water=new THREE.Mesh(geo,mat);water.name='Runtime_Wave_Surface';water.renderOrder=-10;scene.add(water);
}
function makeRays(){
  const group=new THREE.Group();group.name='Runtime_Sun_Shafts';scene.add(group);
  const rand=seeded(192);
  for(let i=0;i<11;i++){
    const top=new THREE.Vector3(-24+rand()*60,55,-45+rand()*95),bottom=top.clone().add(new THREE.Vector3(9,-35-rand()*20,-7));
    const length=top.distanceTo(bottom),geo=new THREE.CylinderGeometry(.10+rand()*.3,1.3+rand()*3.8,length,24,1,true);
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{uTime:shaderTime,phase:{value:rand()*20},strength:{value:.3+rand()*.7}},vertexShader:`varying vec2 vUv;varying vec3 vn;varying vec3 vp;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vp=mv.xyz;vn=normalize(normalMatrix*normal);gl_Position=projectionMatrix*mv;}`,fragmentShader:`varying vec2 vUv;varying vec3 vn;varying vec3 vp;uniform float uTime;uniform float phase;uniform float strength;void main(){float edge=pow(abs(dot(normalize(vn),normalize(-vp))),1.5);float fade=smoothstep(0.,.3,vUv.y)*smoothstep(1.,.8,vUv.y);float f=.7+.3*sin(uTime*.3+phase+vUv.y*5.);gl_FragColor=vec4(.16,.38,.49,.11*edge*fade*f*strength);}`});
    const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(top).add(bottom).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),top.clone().sub(bottom).normalize());group.add(mesh);
  }return group;
}
let scatter;
function makeScatter(){
  const mat=new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexShader:`varying vec3 ray;void main(){ray=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 ray;void main(){vec3 r=normalize(ray);float sun=pow(max(0.,dot(r,normalize(vec3(-.12,.58,-.81)))),18.);float halo=pow(max(0.,dot(r,normalize(vec3(-.12,.58,-.81)))),4.);gl_FragColor=vec4(vec3(.09,.32,.43)*(sun+halo*.2),.65);}`});
  scatter=new THREE.Mesh(new THREE.SphereGeometry(250,40,24),mat);scatter.name='Runtime_Directional_Scattering';scatter.renderOrder=-20;scene.add(scatter);
}
function seeded(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const plumeGroup=new THREE.Group();plumeGroup.name='Runtime_Hydrothermal_Plumes';scene.add(plumeGroup);
function makePlume(emitter){
  const count=800,rand=seeded(emitter.seed);const pos=new Float32Array(count*3),seed=new Float32Array(count*4);
  for(let i=0;i<count;i++){seed.set([rand(),rand()*6.283,rand(),rand()],i*4);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('aSeed',new THREE.BufferAttribute(seed,4));
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:shaderTime,uHeight:{value:emitter.height},uFlow:{value:.030+(emitter.seed%7)*.004},uWidth:{value:emitter.width},uFog:waterFog,uFogColor:{value:fogColor},uPixels:{value:innerHeight*renderer.getPixelRatio()},uOrigin:{value:new THREE.Vector3(...emitter.position)}},vertexShader:`attribute vec4 aSeed;uniform float uTime,uHeight,uWidth,uPixels,uFlow;uniform vec3 uOrigin;varying float vLife,vSeed,vDist;
    void main(){float life=fract(aSeed.x+uTime*uFlow);float h=life*uHeight;float spread=.09+pow(life,.85)*uWidth*(.72+.22*sin(life*19.+uTime*.24)+.16*sin(life*37.-uTime*.36));float theta=aSeed.y+life*5.+sin(life*13.+uTime*.25)*.6;vec3 p=uOrigin+vec3(cos(theta)*spread*sqrt(aSeed.z)+sin(h*.42+uTime*.24)*life*1.2+sin(h*.9-uTime*.3)*life*.45+h*.075,h,sin(theta)*spread*sqrt(aSeed.z)+cos(h*.3-uTime*.2)*life*.6);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(230.,uPixels*(.32+life*2.8)*(.65+aSeed.w*.6)/max(1.,-mv.z));vLife=life;vSeed=aSeed.w;vDist=length(mv.xyz);}`,
    fragmentShader:`uniform float uTime,uFog;uniform vec3 uFogColor;varying float vLife,vSeed,vDist;${hashGLSL}
    void main(){vec2 p=gl_PointCoord*2.-1.;float r=length(p);if(r>1.)discard;float n=fbm(vec3(p*3.5+vSeed*30.,vLife*13.-uTime*.16));float a=pow(1.-r*r,1.5)*smoothstep(.16,.7,n)*.39*smoothstep(0.,.025,vLife)*smoothstep(1.,.72,vLife);vec3 c=mix(vec3(.12,.14,.15),vec3(.48,.53,.55),vLife*.7+n*.3);float fog=1.-exp(-uFog*uFog*vDist*vDist);c=mix(c,uFogColor,fog);gl_FragColor=vec4(c,a*(1.-fog*.6));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});const points=new THREE.Points(geo,mat);points.frustumCulled=false;plumeGroup.add(points);
}
let marineSnow;
function makeSnow(){
  const count=4200,rand=seeded(942),pos=new Float32Array(count*3),sizes=new Float32Array(count);
  for(let i=0;i<count;i++){pos.set([(rand()-.5)*180,rand()*39,(rand()-.5)*180],i*3);sizes[i]=rand();}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:shaderTime,uFog:waterFog,uPixels:{value:innerHeight*renderer.getPixelRatio()}},vertexShader:`attribute float aSize;uniform float uTime,uPixels;varying float vAlpha,vDist;void main(){vec3 p=position;p.y=mod(p.y-uTime*(.025+aSize*.035)+80.,40.);p.x+=sin(uTime*.11+p.z)*.35;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(uPixels*(.012+aSize*.028)/max(1.,-mv.z),.7,5.);vAlpha=.15+aSize*.4;vDist=length(mv.xyz);}`,fragmentShader:`uniform float uFog;varying float vAlpha,vDist;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(.48,.73,.81,pow(1.-d,1.8)*vAlpha*exp(-uFog*uFog*vDist*vDist));}`});marineSnow=new THREE.Points(geo,mat);marineSnow.frustumCulled=false;scene.add(marineSnow);
}


function groundHeight(x,z){
  const hf=manifest.heightfield,n=hf.count;const u=THREE.MathUtils.clamp((x+hf.size/2)/hf.size*(n-1),0,n-1.001),v=THREE.MathUtils.clamp((-z+hf.size/2)/hf.size*(n-1),0,n-1.001);const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hf.rows[j][i],hf.rows[j][i+1],a),THREE.MathUtils.lerp(hf.rows[j+1][i],hf.rows[j+1][i+1],a),b);
}
function constrain(p){
  p.x=THREE.MathUtils.clamp(p.x,-112,112);p.z=THREE.MathUtils.clamp(p.z,-112,112);p.y=THREE.MathUtils.clamp(p.y,groundHeight(p.x,p.z)+1.25,manifest.waterLevel-1.7);
  for(const c of manifest.colliders){
    if(p.y<c.minY-.4||p.y>c.maxY+.6)continue;
    const rx=c.radius[0]+.45,rz=c.radius[2]+.45,dx=(p.x-c.center[0])/rx,dz=(p.z-c.center[2])/rz,r=Math.hypot(dx,dz);
    if(r<1){if(r<.0001){p.x=c.center[0]+rx;}else{p.x=c.center[0]+dx/r*rx;p.z=c.center[2]+dz/r*rz;}}
  }
  p.y=Math.max(p.y,groundHeight(p.x,p.z)+1.25);return p;
}

const response = await fetch('/assets/scene.json');
if (!response.ok) throw new Error('海洋数据加载失败');
manifest = await response.json();
const gltf = await new GLTFLoader().loadAsync('/assets/primordial_ocean.glb', e => progress(e.total ? e.loaded/e.total : 0));
batchStatic(gltf.scene); makeScatter(); makeWater(); makeRays(); makeSnow(); manifest.emitters.forEach(makePlume);
const algae=await createAlgae({scene,source:gltf.scene,groundHeight,emitters:manifest.emitters,growth:algaeGrowthUniform});
let cold=0;
function environment(isCold, algaeGrowth, dt) {
  cold=THREE.MathUtils.damp(cold,isCold?1:0,1.4,dt);
  fogColor.set('#103e59').lerp(new THREE.Color('#537d9b'),cold*.8);
  scene.fog.density=.014+cold*.009; waterFog.value=scene.fog.density;
  sun.intensity=4.3-cold*2; rim.intensity=1.25+cold;
  algae.algaeGrowth=Number(algaeGrowth);
  algae.update(dt,camera);
}
function resize(){ camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);scene.traverse(o=>{if(o.material?.uniforms?.uPixels)o.material.uniforms.uPixels.value=innerHeight*renderer.getPixelRatio();}); }
window.addEventListener('resize',resize);
function quality(high){renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.5:.8));renderer.shadowMap.enabled=high;algae.setQuality(high);marineSnow.geometry.setDrawRange(0,high?4200:900);plumeGroup.children.forEach(p=>p.geometry.setDrawRange(0,high?800:220));scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});resize();}
quality(false);
return {scene,camera,renderer,manifest,groundHeight,constrain,environment,quality,algae,
 tick(dt){elapsed+=dt;shaderTime.value=elapsed;scatter.position.copy(camera.position);},
 render(){renderer.render(scene,camera);}};
}
