import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {growthForSpecies,inClearChannel,sampleAlgaePlacements} from '../src/algae.js';

test('evolution selects the four ecology stages without changing gameplay state',()=>{
  assert.deepEqual(['cell','flagellate','colony','worm','fish','slug','bivalve'].map(growthForSpecies),[0,0,.3,.6,1,1,1]);
});

test('seeded placement attaches to real overlapping surfaces and preserves clearance',()=>{
  const root=new THREE.Group(),mat=new THREE.MeshStandardMaterial();
  for(const [name,x,y,z,width,height] of [['Rock_A',14,1,20,8,2],['Rock_Overlap',14,3,20,3,2],['Rock_Center',0,1,20,8,2],['Rock_Vent',-18,1,20,3,2]]){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,width),mat);mesh.name=name;mesh.position.set(x,y,z);root.add(mesh);
  }
  const emitters=[{position:[-18,4,20]}],floor=()=>0;
  const a=sampleAlgaePlacements(root,floor,emitters),b=sampleAlgaePlacements(root,floor,emitters);
  assert.deepEqual(a,b);assert(a.length>10);
  const ray=new THREE.Raycaster();
  for(let i=0;i<a.length;i++){
    const p=a[i],[x,y,z]=p.position;
    assert(!inClearChannel(x,z));assert(Math.hypot(x+18,z-20)>=3.6);
    ray.set(new THREE.Vector3(x,40,z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(root.children,false)[0];
    assert(Math.abs(y-((hit?.point.y??0)-.018))<1e-6,'root touches highest visible surface');
    for(let j=0;j<i;j++)assert(Math.hypot(x-a[j].position[0],z-a[j].position[2])>=.58);
  }
});
