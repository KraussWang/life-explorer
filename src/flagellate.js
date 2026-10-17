import * as THREE from 'three';

// The supplied GLB is one untextured mesh. Its cell body occupies negative Z,
// while the flagella extend toward positive Z, so both can keep their shape.
export function makeFlagellateMaterial(motionTime){
 const material=new THREE.MeshPhysicalMaterial({
  color:0xc7dce0,metalness:0,roughness:.34,clearcoat:.85,
  clearcoatRoughness:.2,transparent:true,opacity:1,depthWrite:false,
  side:THREE.DoubleSide,forceSinglePass:true,
 });
 material.onBeforeCompile=shader=>{
  shader.uniforms.motionTime=motionTime;
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nuniform float motionTime;\nvarying float vCellAxis;')
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    vCellAxis = position.z;
    float flagellum = smoothstep(-0.08, 0.28, position.z);
    transformed.x += sin(position.z * 8.0 + motionTime * 9.0) * flagellum * pow(max(position.z, 0.0), 2.0) * 0.075;`);
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nvarying float vCellAxis;')
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    float body = 1.0 - smoothstep(-0.32, -0.04, vCellAxis);
    float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
    diffuseColor.a *= mix(0.77, 0.27 + 0.55 * rim, body);
    totalEmissiveRadiance += vec3(0.035, 0.085, 0.105) * rim * body;`);
 };
 material.customProgramCacheKey=()=> 'flagellate-membrane-v1';
 return material;
}

// A muted cytoplasm and granules give the clear membrane visible depth.
// Positions are in the source GLB's local coordinates, before MVP scaling.
export function addFlagellateInterior(root){
 const interior=new THREE.Group();interior.name='Flagellate interior';
 const core=new THREE.Mesh(
  new THREE.IcosahedronGeometry(1,3),
  new THREE.MeshBasicMaterial({color:0x526267,transparent:true,opacity:.28,depthWrite:false})
 );
 core.position.set(-.015,.33,-.58);core.scale.set(.17,.15,.22);
 core.renderOrder=1;interior.add(core);
 const geometry=new THREE.IcosahedronGeometry(1,1);
 const material=new THREE.MeshBasicMaterial({color:0x738b8b,transparent:true,opacity:.5,depthWrite:false});
 const grains=new THREE.InstancedMesh(geometry,material,90);
 grains.name='Cytoplasmic granules';grains.renderOrder=1;
 const dummy=new THREE.Object3D();let seed=4187;
 const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0;i<grains.count;i++){
  const angle=random()*Math.PI*2,radial=Math.sqrt(random())*.18;
  dummy.position.set(Math.cos(angle)*radial,(random()-.5)*.28+.33,-.58+(random()-.5)*.39);
  const size=.006+random()*.013;dummy.scale.set(size,size*(.7+random()),size*(.7+random()));
  dummy.rotation.set(random()*6,random()*6,random()*6);dummy.updateMatrix();grains.setMatrixAt(i,dummy.matrix);
  grains.setColorAt(i,new THREE.Color().setHSL(.45+random()*.12,.04+random()*.1,.5+random()*.3));
 }
 interior.add(grains);root.add(interior);
}
