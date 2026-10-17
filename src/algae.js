import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ALGAE_SEED = 73190;
export function growthForSpecies(species) {
  return ({colony: .3, worm: .6, bivalve: 1, slug: 1, fish: 1})[species] ?? 0;
}
export function seededAlgae(seed = ALGAE_SEED) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function inClearChannel(x, z) {
  return z > -70 && z < 58 && Math.abs(x - Math.sin(z * .045) * 3) < 5.2;
}

const noise = `
float algaeHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float algaeNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(algaeHash(i),algaeHash(i+vec3(1,0,0)),f.x),mix(algaeHash(i+vec3(0,1,0)),algaeHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(algaeHash(i+vec3(0,0,1)),algaeHash(i+vec3(1,0,1)),f.x),mix(algaeHash(i+vec3(0,1,1)),algaeHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`;

/** Compose with the ocean's caustic shader. Uses existing rock geometry and UVs. */
export function addAlgaeFilm(material, growth) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    previous(shader);
    shader.uniforms.algaeGrowth = growth;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vAlgaeUp;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 an=normal;
      #ifdef USE_INSTANCING
      an=mat3(instanceMatrix)*an;
      #endif
      vAlgaeUp=normalize(mat3(modelMatrix)*an).y;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform float algaeGrowth; varying float vAlgaeUp;\n${noise}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float algaePatch=algaeNoise(vOceanWorld*.72)*.45+algaeNoise(vOceanWorld*3.8)*.55;
      float coverage=smoothstep(.80-algaeGrowth*.36,.96-algaeGrowth*.36,algaePatch);
      float wetEdge=smoothstep(.16,.78,vAlgaeUp);
      float film=coverage*wetEdge*smoothstep(0.,.24,algaeGrowth)*.78;
      vec3 pigment=mix(vec3(.02,.038,.006),vec3(.07,.11,.018),algaeNoise(vOceanWorld*2.1));
      diffuseColor.rgb=mix(diffuseColor.rgb,pigment,film);`);
  };
  material.customProgramCacheKey = () => 'ocean-caustics-algae-film-v1';
  material.needsUpdate = true;
}

/** Surface placement is generated once from the actual imported rock triangles. */
export function sampleAlgaePlacements(root, groundHeight, emitters) {
  const rand = seededAlgae(), rocks = [], bins = new Map(), result = [], occupied = new Map();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !/^Rock_/.test(o.name)) return;
    const box = new THREE.Box3().setFromObject(o);
    if (box.max.x < -75 || box.min.x > 75 || box.max.z < -80 || box.min.z > 65) return;
    const entry = {mesh:o, box}; rocks.push(entry);
    for(let x=Math.floor(box.min.x/8);x<=Math.floor(box.max.x/8);x++)
      for(let z=Math.floor(box.min.z/8);z<=Math.floor(box.max.z/8);z++){
        const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(entry);
      }
  });
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0,-1,0), normalMatrix = new THREE.Matrix3();
  function add(x,z,onRock) {
    if(inClearChannel(x,z) || emitters.some(e=>Math.hypot(x-e.position[0],z-e.position[2])<3.6))return;
    const ix=Math.floor(x/.6),iz=Math.floor(z/.6);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)
      for(const p of occupied.get(`${ix+dx},${iz+dz}`)||[])if(Math.hypot(x-p[0],z-p[1])<.58)return;
    ray.set(new THREE.Vector3(x,40,z),down);
    let hit;
    for(const entry of bins.get(`${Math.floor(x/8)},${Math.floor(z/8)}`)||[]){
      if(x<entry.box.min.x||x>entry.box.max.x||z<entry.box.min.z||z>entry.box.max.z)continue;
      const h=ray.intersectObject(entry.mesh,false)[0];if(h&&(!hit||h.distance<hit.distance))hit=h;
    }
    const floor=groundHeight(x,z);
    const n=hit?hit.face.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize():new THREE.Vector3(0,1,0);
    if(onRock&&!hit || n.y<.68 || hit&&hit.point.y<floor-.03)return;
    if(!hit){
      const dx=(groundHeight(x+.15,z)-groundHeight(x-.15,z))/.3,dz=(groundHeight(x,z+.15)-groundHeight(x,z-.15))/.3;
      n.set(-dx,1,-dz).normalize();if(n.y<.85)return;
    }
    const p = {position:[x,(hit?hit.point.y:floor)-.018,z],normal:n.toArray(),yaw:rand()*Math.PI*2,
      scale:.65+rand()*.9,phase:rand()*Math.PI*2,start:.04+Math.pow(rand(),.8)*.78,
      variant:Math.floor(rand()*3),surface:hit?'rock':'ridge'};
    result.push(p);const key=`${ix},${iz}`;if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push([x,z]);
  }
  for(const {box} of rocks){
    const sx=box.max.x-box.min.x,sz=box.max.z-box.min.z;
    if(sx*sz<.24)continue;
    const count=Math.min(40,Math.ceil(sx*sz*.72));
    for(let i=0;i<count;i++)add(box.min.x+rand()*sx,box.min.z+rand()*sz,true);
    // Irregular skirts along the rock foot and adjacent shallow ridges.
    for(let i=0;i<Math.min(25,count);i++){
      const angle=rand()*Math.PI*2,r=.8+rand()*.55;
      add((box.min.x+box.max.x)/2+Math.cos(angle)*sx*.55*r,(box.min.z+box.max.z)/2+Math.sin(angle)*sz*.55*r,false);
    }
  }
  return result;
}

function animatedMaterial(source, uniforms, height, far, leaf) {
  const mat = source.clone();
  mat.color.set(leaf?0x64772a:0xffffff);mat.roughness=.87;mat.side=THREE.DoubleSide;
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {algaeGrowth:uniforms.growth,algaeTime:uniforms.time});
    shader.vertexShader=shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec2 algaeSeed; uniform float algaeGrowth,algaeTime; varying float vAlgaeAlive,vAlgaeDistance;`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float grown=smoothstep(algaeSeed.y,algaeSeed.y+.18,algaeGrowth);
      float h=clamp(position.y/${height.toFixed(5)},0.,1.);
      float phase=algaeSeed.x;
      transformed*=grown;
      transformed.x+=h*h*grown*(sin(algaeTime*.8+phase+h*1.8)*.10+sin(algaeTime*.37+phase*2.)*.055);
      transformed.z+=h*h*grown*sin(algaeTime*.62+phase+h)*.07;
      vAlgaeAlive=grown;
      vec4 anchor=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
      vAlgaeDistance=distance(cameraPosition,anchor.xyz);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlgaeAlive,vAlgaeDistance;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      if(vAlgaeAlive<.005)discard;
      float lod=smoothstep(36.,44.,vAlgaeDistance);
      float dither=fract(dot(floor(gl_FragCoord.xy),vec2(.754877666,.569840296)));
      ${leaf?'if(vAlgaeDistance>55.)discard;':far?'if(dither>=lod)discard;':'if(dither<lod)discard;'}`);
  };
  mat.customProgramCacheKey=()=>`algae-sway-${height}-${far}-${leaf}`;
  return mat;
}

export async function createAlgae({scene, source, groundHeight, emitters, growth}) {
  const loader=new GLTFLoader(),names=['filament-0','filament-1','filament-2','filament-0-lod','filament-1-lod','filament-2-lod','leaf-reused'];
  const assets=await Promise.all(names.map(name=>loader.loadAsync(`/models/algae/${name}.glb`)));
  const placements=sampleAlgaePlacements(source,groundHeight,emitters),group=new THREE.Group();
  group.name='Early_Green_Algae';scene.add(group);
  const uniforms={growth,time:{value:0}},batches=[],dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
  const leaves=placements.filter((p,i)=>i%19===0&&p.surface==='ridge').map(p=>({...p,variant:3,start:.43+(p.start*.48),scale:p.scale*.45}));
  for(let i=0;i<assets.length;i++){
    const meshes=[];assets[i].scene.updateMatrixWorld(true);assets[i].scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
    for(const sourceMesh of meshes){
      const geo=sourceMesh.geometry.clone().applyMatrix4(sourceMesh.matrixWorld);geo.computeBoundingBox();
      const leaf=i===6,variant=leaf?3:i%3,far=i>=3&&!leaf,list=leaf?leaves:placements.filter(p=>p.variant===variant);
      geo.setAttribute('algaeSeed',new THREE.InstancedBufferAttribute(new Float32Array(list.length*2),2));
      const mat=animatedMaterial(sourceMesh.material,uniforms,Math.max(.01,geo.boundingBox.max.y),far,leaf);
      const mesh=new THREE.InstancedMesh(geo,mat,list.length);mesh.name=names[i];mesh.count=0;
      // CPU LOD packing bounds the live geometry; shader dithering blends the overlap.
      mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;group.add(mesh);
      batches.push({mesh,list,far,leaf});
    }
  }
  let target=0,clock=0,lodTimer=Infinity,lastCamera=new THREE.Vector3(Infinity,Infinity,Infinity),high=true;
  function pack(camera){
    for(const {mesh,list,far,leaf} of batches){
      let n=0;const seeds=mesh.geometry.attributes.algaeSeed;
      for(const p of list){
        if(growth.value<=p.start)continue;
        const distance=camera.position.distanceTo(new THREE.Vector3(...p.position));
        if(distance>(high?105:80)||leaf&&distance>55||!leaf&&(far?distance<35:distance>45))continue;
        dummy.position.fromArray(p.position);dummy.quaternion.setFromUnitVectors(up,new THREE.Vector3(...p.normal));
        dummy.rotateY(p.yaw);dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(n,dummy.matrix);seeds.setXY(n,p.phase,p.start);n++;
      }
      mesh.count=n;mesh.instanceMatrix.needsUpdate=true;seeds.needsUpdate=true;
    }
    lastCamera.copy(camera.position);lodTimer=0;
  }
  return {
    group,placements,
    set algaeGrowth(value){if(!Number.isFinite(value))throw new TypeError('algaeGrowth must be finite');target=THREE.MathUtils.clamp(value,0,1);},
    get algaeGrowth(){return target;},get currentGrowth(){return growth.value;},
    setQuality(value){high=value;lodTimer=Infinity;},
    update(dt,camera){
      clock+=dt;uniforms.time.value=clock;const old=growth.value;
      growth.value=THREE.MathUtils.damp(growth.value,target,1.25,dt);
      if(Math.abs(growth.value-target)<.0001)growth.value=target;
      group.visible=growth.value>0;lodTimer+=dt;
      if(lodTimer>.35||(lodTimer>.1&&Math.abs(old-growth.value)>.00001)||lastCamera.distanceToSquared(camera.position)>4)pack(camera);
    },
    stats(){return {seed:ALGAE_SEED,target,current:growth.value,placements:placements.length,rock:placements.filter(p=>p.surface==='rock').length,leaves:leaves.length,activeInstances:batches.reduce((n,b)=>n+b.mesh.count,0),drawCalls:batches.filter(b=>b.mesh.count>0&&group.visible).length};},
    dispose(){group.removeFromParent();for(const {mesh} of batches){mesh.geometry.dispose();mesh.material.dispose();}for(const asset of assets)asset.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}
  };
}
