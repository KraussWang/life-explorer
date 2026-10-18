import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {byId} from './state.js';
import {makeFlagellateMaterial,addFlagellateInterior} from './flagellate.js';
const cache=new Map(),loader=new GLTFLoader();
export function preload(id){
 if(!byId[id].model)return Promise.resolve(null);
 if(!cache.has(id)){const promise=loader.loadAsync('/models/'+byId[id].model).catch(e=>{cache.delete(id);throw e;});cache.set(id,promise);}
 return cache.get(id);
}
export async function makeModel(id,{targetSize=byId[id].size}={}){
 const group=new THREE.Group();group.name=id;
 // cell.glb is 3.95 units long on local X (versus 2 on Y and 1.47 on Z).
 // Its slightly tapered +X end is the leading end. Align that axis with the
 // controller's -Z forward; the other assets have their own source axes.
 if(id==='cell')group.rotation.y=Math.PI/2;
 if(id==='fish'||id==='slug')group.rotation.y=Math.PI;
 if(id==='worm'){
  const geo=new THREE.SphereGeometry(1,20,14),mat=new THREE.MeshStandardMaterial({color:'#c6ab85',roughness:.65});
  for(let i=0;i<13;i++){const segment=new THREE.Mesh(geo,mat);const r=.31*Math.sin((i+1)/14*Math.PI)+.12;segment.scale.set(r,r,.23);segment.position.z=(i-6)*.23;segment.userData.segment=i;group.add(segment);}
  const tip=new THREE.Mesh(new THREE.SphereGeometry(.07,10,8),new THREE.MeshBasicMaterial({color:'#253b37'}));tip.position.set(.12,.22,-1.32);group.add(tip);
 }else{
  const gltf=await preload(id),root=clone(gltf.scene);root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const factor=targetSize/Math.max(size.x,size.y,size.z);root.scale.multiplyScalar(factor);root.position.sub(center.multiplyScalar(factor));group.add(root);
  if(id==='flagellate')addFlagellateInterior(root);
  root.traverse(o=>{if(o.isMesh){o.castShadow=id!=='flagellate';o.frustumCulled=false;
   if(id==='flagellate'&&o.name!=='Cytoplasmic granules'&&o.parent?.name!=='Flagellate interior'){
    const t={value:0};o.userData.motionTime=t;o.material=makeFlagellateMaterial(t);o.renderOrder=2;
   }else if(id==='fish'){
    o.material=o.material.clone();const t={value:0};o.userData.motionTime=t;
    o.material.onBeforeCompile=shader=>{shader.uniforms.motionTime=t;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float motionTime;').replace('#include <begin_vertex>',`#include <begin_vertex>\ntransformed.x += sin(position.z * 7.0 + motionTime * 7.0) * pow(abs(position.z), 2.0) * 0.1;`);};
   }
  }});
 }
 return group;
}
export function animateModel(group,id,time,moving=false){
 if(!group)return;
 group.position.y=id==='bivalve'?0:Math.sin(time*2)*(['worm','slug'].includes(id)?.025:id==='cell'?.025:.1);
 group.rotation.z=id==='bivalve'?0:Math.sin(time*2.4)*(id==='cell'?(moving?.012:.006):(moving?.035:.012));
 if(id==='cell')group.scale.set(1+Math.sin(time*2)*.01,1-Math.sin(time*2)*.008,1);
 group.traverse(o=>{if(o.userData.motionTime)o.userData.motionTime.value=time;if(o.userData.segment!==undefined){const i=o.userData.segment;o.position.x=Math.sin(time*(moving?6:2)-i*.55)*.13;}});
}
export function disposeInstance(group){group?.traverse(o=>{if(o.userData.motionTime)o.material.dispose();if(group.name==='flagellate'&&o.parent?.name==='Flagellate interior'){o.geometry?.dispose();o.material?.dispose();}if(group.name==='worm'){o.geometry?.dispose();o.material?.dispose();}});}
