import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {createObjectives} from '../src/objectives.js';
import {fresh,available,validate} from '../src/state.js';
import {ORGANIC_FLOC_CONFIG as config} from '../src/organic-floc-config.js';

const manifest=JSON.parse(readFileSync(new URL('../public/assets/scene.json',import.meta.url)));
function setup(){
 const groundHeight=(x,z)=>{
  const h=manifest.heightfield,n=h.count,u=THREE.MathUtils.clamp((x+h.size/2)/h.size*(n-1),0,n-1.001),v=THREE.MathUtils.clamp((-z+h.size/2)/h.size*(n-1),0,n-1.001);
  const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h.rows[j][i],h.rows[j][i+1],a),THREE.MathUtils.lerp(h.rows[j+1][i],h.rows[j+1][i+1],a),b);
 };
 const world={scene:new THREE.Scene(),manifest,groundHeight,constrain:p=>p};
 const asset={scene:new THREE.Group()};asset.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshStandardMaterial()));
 const objectives=createObjectives(world,asset),state=fresh();objectives.build(state);
 return {objectives,state,world};
}

test('cell flocs cover the ocean with safe spacing and a few accessible nearby',()=>{
 const {objectives,state,world}=setup(),flocs=objectives.items.filter(item=>item.type==='nutrient');
 assert.equal(flocs.length,config.count);
 assert.ok(flocs.filter(item=>item.anchor.distanceTo(new THREE.Vector3(...state.origin))<32).length>=3);
 assert.ok(flocs.some(item=>Math.abs(item.anchor.x)>35));
 assert.ok(flocs.some(item=>item.anchor.z< -35));
 assert.ok(new Set(flocs.map(item=>Math.round(item.anchor.y))).size>=2);
 for(let i=0;i<flocs.length;i++)for(let j=0;j<i;j++)assert.ok(flocs[i].anchor.distanceTo(flocs[j].anchor)>=config.minSpacing);
 const meshOf=item=>{let mesh;item.floc.group.traverse(o=>{if(o.isMesh)mesh=o;});return mesh;};
 assert.equal(meshOf(flocs[0]).geometry,meshOf(flocs[1]).geometry);
 for(const item of flocs){
  assert.ok(item.group.scale.x>=config.baseScale*(1-config.scaleVariation)&&item.group.scale.x<=config.baseScale*(1+config.scaleVariation));
  assert.ok(item.radius<1.35);
  assert.ok(item.anchor.y>world.groundHeight(item.anchor.x,item.anchor.z)+2);
  for(const c of manifest.colliders){
   if(item.anchor.y<c.minY-.8||item.anchor.y>c.maxY+.8)continue;
   const dx=(item.anchor.x-c.center[0])/(c.radius[0]+1),dz=(item.anchor.z-c.center[2])/(c.radius[2]+1);
   assert.ok(Math.hypot(dx,dz)>=1,`${item.id} overlaps ${c.name}`);
  }
 }
});

test('three distinct contacts unlock evolution once and saved IDs stay valid',()=>{
 const {objectives,state}=setup(),flocs=objectives.items.filter(item=>item.type==='nutrient');
 let notices=0;
 for(let i=0;i<3;i++){
  const item=flocs[[0,5,14][i]],p=item.anchor.clone();
  assert.equal(objectives.update(state,p,i*2,true,()=>notices++),true);
  assert.equal(state.counts.nutrient,i+1);
  assert.equal(objectives.update(state,p,i*2+.1,true,()=>notices++),false);
  objectives.update(state,p,i*2+1.3,false,()=>{});
  assert.equal(item.group.parent,null);
 }
 assert.equal(notices,3);
 assert.equal(available(state),true);
 assert.equal(objectives.target(state,flocs[3].anchor),null);
 assert.doesNotThrow(()=>validate(structuredClone(state)));
 assert.equal(objectives.update(state,flocs[3].anchor.clone(),7,true,()=>notices++),false);
 assert.equal(state.counts.nutrient,3);
 assert.equal(notices,3);
});
