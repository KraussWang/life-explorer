import fs from 'node:fs';
const old=fs.readFileSync('review/baseline/main.js','utf8');
let base=old.slice(old.indexOf('const renderer='),old.indexOf("const labels="));
base=base.replace('preserveDrawingBuffer:review','preserveDrawingBuffer:false').replace('let manifest,','let manifest,');
const collision=old.slice(old.indexOf('function groundHeight'),old.indexOf('function look'));
fs.writeFileSync('src/world.js',`import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export async function createWorld(canvas, progress) {
${base}
${collision}
const response = await fetch('/assets/scene.json');
if (!response.ok) throw new Error('海洋数据加载失败');
manifest = await response.json();
const gltf = await new GLTFLoader().loadAsync('/assets/primordial_ocean.glb', e => progress(e.total ? e.loaded/e.total : 0));
batchStatic(gltf.scene); makeScatter(); makeWater(); makeRays(); makeSnow(); manifest.emitters.forEach(makePlume);
const ecology = new THREE.Group(); scene.add(ecology);
const random = seeded(41);
for(let i=0;i<100;i++) {
  const x=(random()-.5)*80,z=(random()-.5)*80;
  const plant=new THREE.Mesh(new THREE.ConeGeometry(.25+random()*.3,1+random()*2,5),new THREE.MeshStandardMaterial({color:i%2?0x648b62:0x4a9d93,roughness:.9}));
  plant.position.set(x,groundHeight(x,z)+.6,z); plant.rotation.z=(random()-.5)*.4; ecology.add(plant);
}
ecology.visible=false;
let cold=0;
function environment(isCold, isEarly, dt) {
  cold=THREE.MathUtils.damp(cold,isCold?1:0,1.4,dt);
  fogColor.set('#103e59').lerp(new THREE.Color('#537d9b'),cold*.8);
  scene.fog.density=.014+cold*.009; waterFog.value=scene.fog.density;
  sun.intensity=4.3-cold*2; rim.intensity=1.25+cold;
  ecology.visible=isEarly;
  if(isEarly) fogColor.lerp(new THREE.Color('#1c625c'),.2);
  ecology.children.forEach((o,i)=>o.rotation.z=Math.sin(elapsed*1.2+i)*.12);
}
function resize(){ camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);scene.traverse(o=>{if(o.material?.uniforms?.uPixels)o.material.uniforms.uPixels.value=innerHeight*renderer.getPixelRatio();}); }
window.addEventListener('resize',resize);
function quality(high){renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.5:.8));renderer.shadowMap.enabled=high;marineSnow.geometry.setDrawRange(0,high?4200:900);plumeGroup.children.forEach(p=>p.geometry.setDrawRange(0,high?800:220));scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});resize();}
quality(false);
return {scene,camera,renderer,manifest,groundHeight,constrain,environment,quality,
 tick(dt){elapsed+=dt;shaderTime.value=elapsed;scatter.position.copy(camera.position);},
 render(){renderer.render(scene,camera);}};
}
`);
for (const file of fs.readdirSync('public/models')) {
 const b=fs.readFileSync('public/models/'+file),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
 console.log(file, JSON.stringify({meshes:j.meshes?.length,animations:j.animations?.length,materials:j.materials?.map(m=>({name:m.name,alpha:m.alphaMode,unlit:!!m.extensions?.KHR_materials_unlit})),bounds:j.meshes?.slice(0,2).map(m=>m.primitives.map(p=>({min:j.accessors[p.attributes.POSITION].min,max:j.accessors[p.attributes.POSITION].max})))}));
}
