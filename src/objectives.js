import * as THREE from 'three';
import {createNutrientFloc} from './nutrient-floc.js';
import {ORGANIC_FLOC_CONFIG as flocConfig} from './organic-floc-config.js';
const names={nutrient:'有机絮团',food:'复杂食物',specialization:'特化资源',cold:'冷流区',peers:'同类群'};
function seeded(seed){let value=seed>>>0;return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}
export function generateFlocPositions(world,origin){
 const random=seeded(4107+Math.round(origin[0]*19+origin[2]*31)),points=[];
 const valid=p=>{
  if(p.y<world.groundHeight(p.x,p.z)+1.4||p.y>world.manifest.waterLevel-2)return false;
  if(points.some(other=>other.distanceTo(p)<flocConfig.minSpacing))return false;
  for(const c of world.manifest.colliders){
   if(p.y<c.minY-1||p.y>c.maxY+1)continue;
   const dx=(p.x-c.center[0])/(c.radius[0]+1.3),dz=(p.z-c.center[2])/(c.radius[2]+1.3);
   if(Math.hypot(dx,dz)<1)return false;
  }
  for(const vent of world.manifest.emitters){
   if(Math.hypot(p.x-vent.position[0],p.z-vent.position[2])<vent.width+3)return false;
  }
  return true;
 };
 function candidate(x,z){const floor=world.groundHeight(x,z);return new THREE.Vector3(x,floor+flocConfig.floorClearance[0]+random()*(flocConfig.floorClearance[1]-flocConfig.floorClearance[0]),z);}
 for(const [dx,dz] of flocConfig.nearOffsets.slice(0,Math.min(flocConfig.count,flocConfig.requiredAbsorptions))){
  let placed=false;
  for(let attempt=0;attempt<100&&!placed;attempt++){
   const spread=attempt<20?2:6;
   const p=candidate(origin[0]+dx+(random()-.5)*spread,origin[2]+dz+(random()-.5)*spread);
   if(valid(p)){points.push(p);placed=true;}
  }
  if(!placed)throw new Error('无法在出生点附近安全放置有机絮团');
 }
 for(let attempt=0;points.length<flocConfig.count&&attempt<flocConfig.count*500;attempt++){
  const x=flocConfig.rangeX[0]+random()*(flocConfig.rangeX[1]-flocConfig.rangeX[0]);
  const z=flocConfig.rangeZ[0]+random()*(flocConfig.rangeZ[1]-flocConfig.rangeZ[0]);
  const p=candidate(x,z);if(valid(p))points.push(p);
 }
 if(points.length<flocConfig.count)throw new Error('有机絮团分布范围不足');
 return points;
}
export function createObjectives(world,flocAsset=null){
 const root=new THREE.Group();world.scene.add(root);let items=[];
 function clear(){
  for(const item of items){
   if(item.floc){if(!item.disposed)item.floc.dispose();continue;}
   const geometries=new Set(),materials=new Set();
   item.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
   geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
  root.clear();items=[];
 }
 function add(type,index,offset,state,position=null){
  const p=position?.clone()||new THREE.Vector3(...state.origin).add(new THREE.Vector3(...offset));
  if(!position){p.x=THREE.MathUtils.clamp(p.x,-80,80);p.z=THREE.MathUtils.clamp(p.z,-80,80);p.y=Math.max(p.y,world.groundHeight(p.x,p.z)+3.3);world.constrain(p);}
  const colors={nutrient:0xf3da87,food:0x97e0a4,specialization:0xe9ad80,cold:0x8edbff,peers:0xd2b0f6};
  const group=new THREE.Group();group.position.copy(p);root.add(group);
  if(type==='nutrient'){
   const floc=createNutrientFloc(index,flocAsset);group.add(floc.group);
   if(state.species==='cell')group.scale.setScalar(flocConfig.baseScale*(1+flocConfig.scaleVariation*(seeded(713+index*1009)()*2-1)));
   const radius=state.species==='cell'?.7+.88*group.scale.x:1.35;
   const id=type+'-'+index;
   items.push({id,type,name:names[type],position:group.position,anchor:p.clone(),group,floc,radius,seed:index,absorbing:null,disposed:false,baseScale:group.scale.x});
   group.visible=!state.collected.includes(id);return;
  }
  const isZone=type==='cold'||type==='peers';
  const geometry=type==='food'?new THREE.IcosahedronGeometry(.65,0):type==='specialization'?new THREE.OctahedronGeometry(.55):new THREE.SphereGeometry(isZone?.28:.32,16,12);
  const mat=new THREE.MeshStandardMaterial({color:colors[type],emissive:colors[type],emissiveIntensity:1.5,roughness:.4});
  if(isZone){for(let i=0;i<(type==='peers'?7:12);i++){const m=new THREE.Mesh(geometry,mat);const a=i/12*Math.PI*2;m.position.set(Math.sin(a)*2.3,Math.sin(i*3)*.7,Math.cos(a)*2.3);group.add(m);}}
  else {const mesh=new THREE.Mesh(geometry,mat);group.add(mesh);}
  const ring=new THREE.Mesh(new THREE.TorusGeometry(isZone?3:.65,.025,6,48),new THREE.MeshBasicMaterial({color:colors[type],transparent:true,opacity:.65}));ring.rotation.x=Math.PI/2;ring.position.y=-.7;group.add(ring);
  const glow=new THREE.Mesh(new THREE.SphereGeometry(isZone?2.8:.8,16,12),new THREE.MeshBasicMaterial({color:colors[type],transparent:true,opacity:.055,depthWrite:false}));group.add(glow);
  const id=type+'-'+index;const item={id,type,name:names[type],position:p,group,radius:isZone?3.6:1.35};items.push(item);group.visible=!state.collected.includes(id);
 }
 function build(state){
  clear();
  if(state.species==='cell')generateFlocPositions(world,state.origin).forEach((p,i)=>add('nutrient',i,null,state,p));
  if(state.species==='flagellate'){add('nutrient',0,[0,0,-5],state);add('nutrient',1,[3,0,-10],state);add('cold',0,[0,0,-18],state);add('peers',0,[8,0,-24],state);}
  if(state.species==='colony'){add('food',0,[0,0,-6],state);add('specialization',0,[-4,0,-11],state);add('specialization',1,[3,0,-16],state);}
 }
 function target(state,position){
  return items.filter(i=>i.group.visible&&!i.absorbing&&!(i.type==='nutrient'&&state.counts.nutrient>= (state.species==='cell'?flocConfig.requiredAbsorptions:2))&&!(i.type==='cold'&&state.cold!=='dormant')&&!(i.type==='peers'&&(state.cold==='dormant'||state.gathered))).sort((a,b)=>a.position.distanceTo(position)-b.position.distanceTo(position))[0]||null;
 }
 function update(state,position,time,canCollect,notify){
  let changed=false;
  for(const item of items){
   if(!item.group.visible)continue;
   if(item.floc){
    if(item.absorbing){
     const t=Math.min(1,(time-item.absorbing.start)/1.15),ease=t*t*(3-2*t);
     item.position.copy(item.absorbing.from).lerp(position,ease);
     item.group.scale.setScalar(item.baseScale*(1-.92*ease));item.floc.animate(time,t);
     if(t>=1){item.group.visible=false;root.remove(item.group);item.floc.dispose();item.disposed=true;}
     continue;
    }
    item.position.copy(item.anchor).add(new THREE.Vector3(Math.sin(time*.23+item.seed)*.22,Math.sin(time*.39+item.seed*2)*.16,Math.cos(time*.19+item.seed)*.16));
    world.constrain(item.position);item.position.y=Math.max(item.position.y,world.groundHeight(item.position.x,item.position.z)+1.1);
    item.floc.animate(time);
   }else{
   item.group.rotation.y=time*.3;item.group.children.forEach((m,i)=>{if(i===0)m.rotation.y=time;});
   }
   if(!canCollect||!item.group.visible||position.distanceTo(item.position)>item.radius||state.collected.includes(item.id))continue;
   if(item.type==='nutrient'&&state.counts.nutrient>=(state.species==='cell'?flocConfig.requiredAbsorptions:2))continue;
   if(item.type==='cold'){
    if(state.cold==='dormant'){state.cold='active';changed=true;notify('冷流抵达：水温骤降。寻找紫色同类群！');}
   }else if(item.type==='peers'){
    if(state.cold==='active'&&!state.gathered){state.gathered=true;changed=true;notify('找到同类：聚集形成庇护，多细胞化的机会正在出现。');}
   }else{
    state.collected.push(item.id);state.counts[item.type]++;
    if(item.floc)item.absorbing={start:time,from:item.position.clone()};else item.group.visible=false;
    changed=true;notify(item.floc?'吸收有机絮团 · 营养 +1':item.name+' +1');
   }
  }
  return changed;
 }
 return {build,target,update,get items(){return items;}};
}
