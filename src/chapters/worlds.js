import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createScallopWorld} from '../scallop/world.js';

const loader=new GLTFLoader();
const coastHeight=(x,z)=>{
 const y=-z,warp=6*Math.sin(y*.036)+2.8*Math.sin(y*.108+.8)+1.4*Math.sin(y*.21);
 const main=x-warp,branch=x+22+9*Math.sin(y*.042+1.1),east=x-33-6*Math.sin(y*.063);
 let h=.76+.16*Math.sin(x*.08+y*.10)+.10*Math.sin(x*.23-y*.17)+.055*Math.sin(x*.71+y*.61)+.026*Math.sin(x*1.9-y*1.4);
 h-=1.26*Math.exp(-((main/12.5)**2));
 h-=1.12*Math.exp(-((branch/5.8)**2))*(.70+.30*Math.sin(y*.033+.5)**2);
 h-=.88*Math.exp(-((east/4.5)**2))*(.65+.35*Math.sin(y*.045)**2);
 h+=.42*Math.exp(-(((main-10)/5)**2))*(.5+.5*Math.sin(y*.11+.7));
 if(y>78)h-=(y-78)*.016;return h;
};
function seeded(seed){return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
function meshFrom(root){let mesh;root.traverse(o=>{if(!mesh&&o.isMesh)mesh=o;});return mesh;}
function scatter(scene,source,count,seed,position,scale=1){
 const original=meshFrom(source);if(!original)return;
 const material=original.material.clone();material.side=THREE.DoubleSide;
 const geo=original.geometry,inst=new THREE.InstancedMesh(geo,material,count),rand=seeded(seed),dummy=new THREE.Object3D();
 for(let i=0;i<count;i++){
  const x=(rand()-.5)*80,z=(rand()-.5)*100;
  const [px,py,pz]=position(x,z);
  dummy.position.set(px,py,pz);dummy.rotation.y=rand()*Math.PI*2;
  const s=scale*(.65+rand()*.8);dummy.scale.setScalar(s);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);
 }
 inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();scene.add(inst);return inst;
}
function base(renderer,camera,scene,groundHeight,bounds,spawn,waterLevel=null){
 const world={scene,renderer,camera,groundHeight,bounds,spawn,waterLevel,elapsed:0,
  constrain(p,clearance=.2){
   p.x=THREE.MathUtils.clamp(p.x,bounds[0],bounds[1]);p.z=THREE.MathUtils.clamp(p.z,bounds[2],bounds[3]);
   p.y=Math.max(p.y,groundHeight(p.x,p.z)+clearance);
   if(world.waterLevel!==null)p.y=Math.min(p.y,Math.max(world.waterLevel+2,groundHeight(p.x,p.z)+clearance));return p;
  },
  resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);},
  quality(high){renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.35:.8));renderer.shadowMap.enabled=high;world.resize();},
  tick(dt){world.elapsed+=dt;},render(){renderer.render(scene,camera);},environment(){}
 };return world;
}
async function coast(renderer,camera){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#a4b8bb');scene.fog=new THREE.FogExp2('#9fb1ad',.007);
 scene.add(new THREE.HemisphereLight(0xe3f3fa,0x6b6958,1.65));
 const sun=new THREE.DirectionalLight(0xffe0ae,2.2);sun.position.set(-60,100,30);scene.add(sun);
 const terrain=(await loader.loadAsync('/stages/coast/terrain.glb')).scene;
 terrain.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.material=o.material.clone();o.material.side=THREE.DoubleSide;}});scene.add(terrain);
 const water=new THREE.Mesh(new THREE.PlaneGeometry(240,220),new THREE.MeshPhysicalMaterial({color:0x367b83,transparent:true,opacity:.63,roughness:.24,metalness:.04,side:THREE.DoubleSide,depthWrite:false}));water.name='chapter-water';water.rotation.x=-Math.PI/2;water.position.set(0,.02,-20);scene.add(water);
 const [rock,joint,fan]=await Promise.all(['Hyper3D_rock.glb','Hyper3D_jointed_plant.glb','Hyper3D_fan_plant.glb'].map(n=>loader.loadAsync('/stages/coast/'+n)));
 const spot=(x,z)=>[x,coastHeight(x,z),z];
 scatter(scene,rock.scene,110,31,spot,.8);scatter(scene,joint.scene,130,41,spot,.9);scatter(scene,fan.scene,70,53,spot,1.1);
 const grassBed=scatter(scene,fan.scene,85,83,(x,z)=>{const px=-10+x*.18,pz=68+z*.22;return [px,coastHeight(px,pz),pz];},.75);
 const w=base(renderer,camera,scene,coastHeight,[-110,110,-125,85],[-10,coastHeight(-10,75)+.45,75],.02);
 w.setPreset=(preset,biome)=>{
  w.preset=preset;w.waterLevel=preset==='retreating-water' ? -.12 : preset==='low-oxygen' ? -.12 : biome==='seagrass-bed' ? .16 : biome==='open-water' ? 5 : 0;
  water.position.y=w.waterLevel+.02;
  water.material.color.set(preset==='low-oxygen'?0x777f70:biome==='seagrass-bed'?0x327d72:0x367b83);
  scene.fog.color.set(preset==='low-oxygen'?'#a2a99c':'#9fb1ad');
  if(grassBed)grassBed.visible=biome==='seagrass-bed';
 };
 w.tick=dt=>{w.elapsed+=dt;water.material.opacity=.59+Math.sin(w.elapsed*.7)*.035;};
 return w;
}
async function forest(renderer,camera){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#b6c0a4');scene.fog=new THREE.FogExp2('#9cae97',.01);
 scene.add(new THREE.HemisphereLight(0xe4f4db,0x55523c,1.6));
 const sun=new THREE.DirectionalLight(0xffe2ac,2.1);sun.position.set(-55,95,-70);scene.add(sun);
 const terrain=(await loader.loadAsync('/stages/forest/forest_terrain.glb')).scene;scene.add(terrain);terrain.updateMatrixWorld(true);
 const meshes=[],riverMeshes=[];terrain.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.side=THREE.DoubleSide;o.receiveShadow=true;
  if(o.material.name?.includes('river water')){o.material.color.set('#4d796e');o.material.transparent=true;o.material.opacity=.75;}
  else if(o.material.name?.includes('wet river'))o.material.color.set('#8f866d');
  else if(o.material.name?.includes('ridge'))o.material.color.set('#657765');
  else o.material.color.set('#849071');
  if(/river/i.test(o.name)||/river water/i.test(o.material.name))riverMeshes.push(o);else meshes.push(o);
 }});
 const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);ray.far=300;
 const groundHeight=(x,z)=>{ray.set(new THREE.Vector3(x,100,z),down);const hit=ray.intersectObjects(meshes,false);return hit[0]?.point.y??0;};
 const [tree1,tree2,shrub]=await Promise.all(['tree1_lods.glb','tree2_lods.glb','shrub_lods.glb'].map(n=>loader.loadAsync('/stages/forest/'+n)));
 const spot=(x,z)=>{const px=x+(x<0?-23:23),pz=z-18;return [px,groundHeight(px,pz),pz];};
 const earlyTrees=scatter(scene,tree1.scene,95,106,spot,9),lateTrees=scatter(scene,tree2.scene,75,207,spot,11);
 const nearTrees=scatter(scene,tree1.scene,34,178,(x,z)=>{const px=(x<0?-1:1)*(10+Math.abs(x)*.35),pz=z-18;return [px,groundHeight(px,pz),pz];},8);
 scatter(scene,shrub.scene,80,305,(x,z)=>[x,groundHeight(x,z),z],1.6);
 const spawn=[0,groundHeight(0,0)+.25,0];const w=base(renderer,camera,scene,groundHeight,[-70,70,-110,110],spawn);
 w.waterSurface=(x,z)=>{ray.set(new THREE.Vector3(x,100,z),down);return ray.intersectObjects(riverMeshes,false)[0]?.point.y??null;};
 w.setPreset=preset=>{w.preset=preset;const late=['late-mammal','bird-lineage'].includes(preset);scene.fog.color.set(late?'#a9b995':'#9cae97');scene.background.set(late?'#c3cba7':'#b6c0a4');
  earlyTrees.visible=!late;nearTrees.visible=!late;lateTrees.visible=late;
 };
 return w;
}
export function createWorldBank(renderer,camera){
 const cache=new Map();return {async get(sceneId){
  if(!cache.has(sceneId))cache.set(sceneId,sceneId==='S02'?createScallopWorld(renderer,camera):sceneId==='S03'?coast(renderer,camera):forest(renderer,camera));
  const world=await cache.get(sceneId);
  if(sceneId==='S02'&&!world.setPreset)world.setPreset=preset=>{
   world.preset=preset;world.scene.fog=preset==='deep-reef'?new THREE.FogExp2(0x071e30,.035):new THREE.FogExp2(0x1a566b,.008);
  };
  return world;
 }};
}
