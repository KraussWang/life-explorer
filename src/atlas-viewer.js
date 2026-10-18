import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const $=id=>document.getElementById(id);
export function disposeCatalogObject(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat().filter(Boolean))materials.add(m);});
 for(const m of materials){for(const t of Object.values(m))if(t?.isTexture)textures.add(t);m.dispose();}
 geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());
}
export function normalizeCatalogModel(root){
 root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 const group=new THREE.Group(),offset=new THREE.Group();offset.position.copy(center).negate();offset.add(root);group.add(offset);group.scale.setScalar(3/Math.max(size.x,size.y,size.z,.00001));return group;
}
export function createModelViewer(){
 let renderer,scene,camera,controls,object,mixer,request=0,lastTime=0,entry;
 const loader=new GLTFLoader(),dialog=$('atlas-model');
 function disposeModel(){if(mixer){mixer.stopAllAction();mixer.uncacheRoot(mixer.getRoot());mixer=null;}if(object){scene.remove(object);disposeCatalogObject(object);object=null;}}
 function cleanup(){request++;disposeModel();controls?.dispose();controls=null;renderer?.dispose();renderer?.forceContextLoss();renderer=null;scene=null;
  // A lost context can be restored asynchronously. Never reuse its canvas for
  // the next viewer instance (rapid reopen otherwise receives a lost context).
  const canvas=$('preview');canvas.replaceWith(canvas.cloneNode(false));
 }
 dialog.addEventListener('close',()=>{cleanup();if($('atlas').open)$('atlas-view-model').focus();});
 function reset(){camera.position.set(4,2.2,5);controls.target.set(0,0,0);controls.update();}
 async function load(url){
  const token=++request;disposeModel();$('preview-loading').hidden=false;$('preview-loading').textContent='正在载入真实 3D 模型…';$('model-retry').hidden=true;
  try{const gltf=await loader.loadAsync(url);if(token!==request||!dialog.open){disposeCatalogObject(gltf.scene);return;}
   object=normalizeCatalogModel(gltf.scene);scene.add(object);if(gltf.animations.length){mixer=new THREE.AnimationMixer(gltf.scene);mixer.clipAction(gltf.animations[0]).play();}
   reset();$('preview-loading').hidden=true;dialog.dataset.loaded=entry.id;
  }catch(error){if(token!==request)return;$('preview-loading').textContent='模型加载失败，点击重试。';$('model-retry').hidden=false;delete dialog.dataset.loaded;}
 }
 $('model-retry').onclick=()=>load($('model-variant').value);
 $('model-reset').onclick=()=>reset();
 $('model-variant').onchange=()=>{delete dialog.dataset.loaded;load($('model-variant').value);};
 return {
  open(next){entry=next;delete dialog.dataset.loaded;dialog.showModal();$('model-name').textContent=entry.name;$('model-latin').textContent=entry.latin;
   renderer=new THREE.WebGLRenderer({canvas:$('preview'),alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
   scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xecfaff,0x62766b,2.6));const light=new THREE.DirectionalLight(0xffebd2,3);light.position.set(3,6,5);scene.add(light);const rim=new THREE.DirectionalLight(0x8ed8ff,2);rim.position.set(-4,2,-3);scene.add(rim);
   camera=new THREE.PerspectiveCamera(36,1,.01,100);controls=new OrbitControls(camera,$('preview'));controls.enableDamping=true;controls.enablePan=false;controls.minDistance=2.8;controls.maxDistance=14;reset();
   $('model-variant').innerHTML=[{name:'原始模型',url:entry.model},...(entry.variants||[])].map(v=>`<option value="${v.url}">${v.name}</option>`).join('');$('model-variant-label').hidden=!entry.variants?.length;
   lastTime=0;load(entry.model);
  },
  close(){if(dialog.open)dialog.close();},
  tick(time){if(!renderer||!dialog.open||document.hidden)return;const canvas=$('preview'),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
   if(renderer.domElement.width!==Math.round(w*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
   const dt=lastTime?Math.min(time-lastTime,.05):0;lastTime=time;mixer?.update(dt);controls.update();renderer.render(scene,camera);
  },
 };
}
