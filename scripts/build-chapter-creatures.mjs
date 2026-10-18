import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

// FileReader is only used by GLTFExporter to turn its final Blob into bytes.
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}};
const destination=new URL('../public/stages/creatures/',import.meta.url);
const material=(color)=>new THREE.MeshStandardMaterial({color,roughness:.86,metalness:0,flatShading:true});
const eye=material('#182527');
function ellipsoid(parent,color,position,scale,detail=1){const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(1,detail),material(color));mesh.position.set(...position);mesh.scale.set(...scale);parent.add(mesh);return mesh;}
function limb(parent,color,start,end,radius){const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),dir=b.clone().sub(a);const m=new THREE.Mesh(new THREE.CylinderGeometry(radius*.72,radius,dir.length(),8),material(color));m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());parent.add(m);ellipsoid(parent,color,end,[radius*1.25,radius*.65,radius*1.7]);}
function coelacanth(){
 const g=new THREE.Group();ellipsoid(g,'#426b77',[0,0,0],[.6,.46,1.4],2);ellipsoid(g,'#638994',[0,.01,-1.05],[.5,.39,.64],2);
 ellipsoid(g,'#243f4d',[0,.18,.8],[.17,.48,.46]);
 for(const x of [-1,1]){ellipsoid(g,'#b9aa78',[x*.4,-.3,.1],[.54,.12,.34]);ellipsoid(g,'#a69a70',[x*.4,-.24,.8],[.42,.1,.25]);ellipsoid(g,'#182527',[x*.38,.13,-1.35],[.075,.075,.075]);}
 ellipsoid(g,'#4e7781',[0,0,1.65],[.65,.37,.12]);return g;
}
function amniote(lizard=false){
 const g=new THREE.Group(),body=lizard?'#5b7354':'#817a59',pale=lizard?'#8d9d6d':'#aaa17b';
 ellipsoid(g,body,[0,.5,0],lizard?[.32,.26,.85]:[.49,.33,.83],2);ellipsoid(g,pale,[0,.48,-.82],lizard?[.31,.22,.45]:[.43,.3,.45],2);
 const tail=ellipsoid(g,body,[0,.43,1.16],lizard?[.17,.16,1.25]:[.25,.2,.93],2);tail.rotation.x=-.1;
 for(const x of [-1,1])for(const z of [-.48,.55]){
  limb(g,body,[x*(lizard?.22:.35),.4,z],[x*(lizard?.62:.7),.08,z+(z>0?.15:-.15)],lizard?.08:.12);
 }
 for(const x of [-1,1])ellipsoid(g,eye,[x*(lizard?.26:.36),.58,-1.13],[.055,.055,.055]);
 if(!lizard)for(const z of [-.1,.22])ellipsoid(g,pale,[0,.77,z],[.22,.13,.18]);
 return g;
}
function tetrapod(){
 const g=new THREE.Group(),body='#567d70',pale='#88a38c';
 ellipsoid(g,body,[0,.42,0],[.56,.35,1.15],2);ellipsoid(g,pale,[0,.42,-1.02],[.7,.3,.55],2);
 const tail=ellipsoid(g,body,[0,.32,1.27],[.3,.22,.94],2);tail.rotation.x=-.1;
 for(const x of [-1,1])for(const z of [-.68,.67])limb(g,body,[x*.38,.35,z],[x*.82,.06,z+.15],.15);
 for(const x of [-1,1])ellipsoid(g,eye,[x*.47,.62,-1.24],[.075,.075,.075]);
 return g;
}
function manatee(){
 const g=new THREE.Group();ellipsoid(g,'#8a9b8d',[0,0,0],[.81,.58,1.5],2);ellipsoid(g,'#9daea0',[0,-.02,-1.13],[.58,.46,.55],2);
 for(const x of [-1,1]){const flipper=ellipsoid(g,'#809487',[x*.72,-.31,-.1],[.55,.12,.38]);flipper.rotation.z=x*.15;ellipsoid(g,eye,[x*.43,.17,-1.47],[.048,.048,.048]);}
 ellipsoid(g,'#809487',[0,-.08,1.68],[.87,.12,.51]);ellipsoid(g,'#789084',[0,-.2,-1.56],[.45,.16,.22]);return g;
}
for(const [name,create] of Object.entries({'coelacanth.glb':coelacanth,'tetrapod.glb':tetrapod,'amniote.glb':()=>amniote(false),'lizard.glb':()=>amniote(true),'manatee.glb':manatee})){
 const scene=new THREE.Scene();scene.add(create());const buffer=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true});
 await fs.writeFile(path.join(fileURLToPath(destination),name),Buffer.from(buffer));console.log(name,buffer.byteLength);
}
