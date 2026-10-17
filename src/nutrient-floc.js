import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

let assetPromise;
export function loadNutrientFlocAsset(){
 if(!assetPromise)assetPromise=new GLTFLoader().loadAsync('/models/nutrient-floc.glb').catch(error=>{
  console.warn('Organic floc GLB unavailable; using procedural fallback.',error);
  return null;
 });
 return assetPromise;
}

function createModelNutrientFloc(seed,asset){
 const group=new THREE.Group();group.name='Organic nutrient floc';
 const body=asset.scene.clone(true);
 const box=new THREE.Box3().setFromObject(body),size=box.getSize(new THREE.Vector3());
 const scale=1.76/Math.max(size.x,size.y,size.z);
 body.scale.multiplyScalar(scale);body.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(scale));
 group.add(body);
 const materials=[];
 body.traverse(object=>{
  if(!object.isMesh)return;
  const material=object.material.clone();object.material=material;materials.push(material);
  const name=object.name;
  material.metalness=0;
  if(name.startsWith('SourceFloc')){
   material.transparent=true;
   material.color.set(0xe9f2fc);
   material.emissive.set(0x9bb8d3);
   material.emissiveIntensity=.12;
   material.opacity=.32;
   material.depthWrite=false;
   material.side=THREE.DoubleSide;
   material.forceSinglePass=true;
   object.renderOrder=2;
  }else if(name.startsWith('Membrane_')){
   material.transparent=true;
   material.color.set(name.includes('Blue')?0xd8eaf4:0xf4f7f3);
   material.emissive.set(name.includes('Blue')?0xb9d2e7:0xf0f4ed);
   material.emissiveIntensity=.55;
   material.opacity=name.includes('Blue')?.11:.15;
   material.depthWrite=false;
   material.side=THREE.DoubleSide;
   material.forceSinglePass=true;
   object.renderOrder=2;
  }else{
   material.transparent=false;
   material.opacity=1;
   material.depthWrite=true;
   material.roughness=name.startsWith('Filament_')?.5:.7;
   material.emissive=new THREE.Color(name.includes('Blue')?0x152c35:0x2b3028);
   material.emissiveIntensity=.16;
   object.renderOrder=1;
  }
  material.userData.flocOpacity=material.opacity;
  material.needsUpdate=true;
 });
 function animate(time,absorption=0){
  body.rotation.set(Math.sin(time*.13+seed)*.11,time*.12+seed*1.7,Math.cos(time*.16+seed)*.1);
  body.scale.setScalar(scale*(1+Math.sin(time*.62+seed)*.035)*(1-absorption*.28));
  for(const material of materials){
   if(material.transparent)material.opacity=material.userData.flocOpacity*(1-absorption);
  }
 }
 animate(0);
 return {group,animate,dispose(){materials.forEach(material=>material.dispose());}};
}

export function createNutrientFloc(seed,asset=null){
 return asset?createModelNutrientFloc(seed,asset):createProceduralNutrientFloc(seed);
}

// A porous aggregate: lit organic grains, a filament scaffold and torn membranes.
// Seeded variants keep the silhouette stable when a saved journey is resumed.
function createProceduralNutrientFloc(seed){
 let value=seed+193;
 const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
 const group=new THREE.Group();group.name='Organic nutrient floc';
 const body=new THREE.Group();group.add(body);
 const material=new THREE.MeshStandardMaterial({color:0xd4d7d0,roughness:.82,metalness:0,transparent:true,side:THREE.DoubleSide});
 // Weak, view-dependent warmth on actual surfaces, without a luminous shell.
 material.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   float flocRim = pow(1.0 - max(0.0, dot(normal, normalize(vViewPosition))), 3.0);
   totalEmissiveRadiance += vec3(0.16, 0.095, 0.035) * flocRim;`);
 };
 material.customProgramCacheKey=()=> 'organic-floc-rim-v1';
 const nodes=[];
 for(let i=0;i<110;i++){
  const a=random()*Math.PI*2,z=random()*2-1,r=.24+random()*.54;
  const radial=Math.sqrt(1-z*z);
  nodes.push(new THREE.Vector3(Math.cos(a)*radial*r, z*r*.83, Math.sin(a)*radial*r*.72));
 }
 const strands=[],membranes=[];
 for(let i=0;i<nodes.length;i++){
  const a=nodes[i];
  const near=nodes.map((p,j)=>({p,j,d:p.distanceTo(a)})).filter(n=>n.j!==i).sort((x,y)=>x.d-y.d).slice(0,3);
  for(const n of near){
   if(n.j<i||n.d>.55)continue;
   const mid=a.clone().lerp(n.p,.5).add(new THREE.Vector3((random()-.5)*.1,(random()-.5)*.1,(random()-.5)*.1));
   strands.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a,mid,n.p]),6,.004+random()*.006,5,false));
  }
  if(i%3!==0&&near[1].d<.42){
   const b=near[0].p,c=near[1].p,center=a.clone().add(b).add(c).multiplyScalar(1/3);
   // An open center keeps the thin films perforated instead of a solid blob.
   const inner=[a,b,c].map(p=>p.clone().lerp(center,.56));
   [a,b,c].forEach((p,j)=>{const q=[a,b,c][(j+1)%3],u=inner[j],v=inner[(j+1)%3];
    for(const point of [p,q,u,q,v,u])membranes.push(point.x,point.y,point.z);
   });
  }
 }
 const fibers=new THREE.Mesh(mergeGeometries(strands),material);body.add(fibers);strands.forEach(g=>g.dispose());
 const filmGeometry=new THREE.BufferGeometry();filmGeometry.setAttribute('position',new THREE.Float32BufferAttribute(membranes,3));filmGeometry.computeVertexNormals();
 const filmMaterial=new THREE.MeshStandardMaterial({color:0xcbd5d3,roughness:.65,transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false});
 body.add(new THREE.Mesh(filmGeometry,filmMaterial));
 let grainGeometry=new THREE.IcosahedronGeometry(1,2);
 const vertices=grainGeometry.attributes.position;
 // Corrugated flakes with curled edges, rather than round molecular beads.
 for(let i=0;i<vertices.count;i++){
  const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
  const ripple=1+Math.sin(x*9+y*6)*.1+Math.cos(y*11-z*8)*.07;
  vertices.setXYZ(i,x*ripple,y*ripple,z*.17+Math.sin(x*5+y*4)*.2);
 }
 const unmerged=grainGeometry;grainGeometry=mergeVertices(unmerged);unmerged.dispose();grainGeometry.computeVertexNormals();
 const grains=new THREE.InstancedMesh(grainGeometry,material,290);grains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 // Animated detached grains remain inside this conservative local bound.
 grains.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1.8);body.add(grains);
 const specs=[],matrix=new THREE.Object3D();
 for(let i=0;i<grains.count;i++){
  const p=nodes[i%nodes.length].clone();
  p.add(new THREE.Vector3(random()-.5,random()-.5,random()-.5).multiplyScalar(i>266?.38:.12));
  const size=.018+Math.pow(random(),2)*.11;
  specs.push({p,size,phase:random()*Math.PI*2,stretch:.5+random()});
  grains.setColorAt(i,new THREE.Color().setHSL(.12+random()*.06,.025+random()*.05,.68+random()*.24));
 }
 function animate(time,absorption=0){
  body.rotation.set(Math.sin(time*.13+seed)*.14,time*.12+seed*1.7,Math.cos(time*.16+seed)*.1);
  body.scale.setScalar(1+Math.sin(time*.62+seed)*.035);
  material.opacity=1-absorption*.95;filmMaterial.opacity=.38*(1-absorption);
  fibers.scale.setScalar(1-absorption*.35);
  for(let i=0;i<specs.length;i++){
   const s=specs[i],loose=i>266;
   const spread=1+Math.sin(time*.55+s.phase)*(loose?.17:.045);
   // Loose particles lag behind, then follow the aggregate into the membrane.
   matrix.position.copy(s.p).multiplyScalar(spread*(1-absorption*.8));
   if(loose)matrix.position.y+=Math.sin(time*.3+s.phase)*.07;
   matrix.rotation.set(s.phase,time*.08+s.phase,s.phase*.6);
   const scale=s.size*Math.max(.01,1-absorption*(loose?1.15:.85));
   matrix.scale.set(scale,scale*s.stretch,scale*.8);matrix.updateMatrix();grains.setMatrixAt(i,matrix.matrix);
  }
  grains.instanceMatrix.needsUpdate=true;
 }
 animate(0);
 return {group,animate,dispose(){
  const geometries=new Set(),materials=new Set();
  group.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material);if(object.isInstancedMesh)object.dispose();});
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(mat=>mat.dispose());
 }};
}
