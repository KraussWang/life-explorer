import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {species,byId} from './state.js';
import {makeModel,animateModel,disposeInstance} from './models.js';
const $=id=>document.getElementById(id);
export function createAtlas(getState){
 let renderer,scene,camera,controls,model,index=0,request=0;
 function init(){
  if(renderer)return;
  renderer=new THREE.WebGLRenderer({canvas:$('preview'),alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;
  scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xe0f8ee,0x3f5362,3));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(3,5,4);scene.add(key);
  camera=new THREE.PerspectiveCamera(35,1,.1,50);camera.position.set(4,2,5);
  controls=new OrbitControls(camera,$('preview'));controls.enableDamping=true;controls.enablePan=false;controls.minDistance=3;controls.maxDistance=12;
 }
 async function select(next){
  index=(next+species.length)%species.length;const spec=species[index],state=getState(),unlocked=state.unlocked.includes(spec.id),token=++request;
  $('atlas-list').querySelectorAll('button').forEach((b,i)=>b.classList.toggle('selected',i===index));
  if(model){scene.remove(model);disposeInstance(model);model=null;}
  $('preview-loading').hidden=false;$('preview-loading').textContent=unlocked?'正在载入三维形态…':'尚未发现 · 沿演化路线解锁';
  const parent=species.find(s=>s.next.includes(spec.id));
  $('atlas-description').innerHTML=`<h3>${spec.name}${unlocked?'':' · 未解锁'}</h3><dl><dt>时期</dt><dd>${spec.era}</dd><dt>生境</dt><dd>${spec.habitat}</dd><dt>特征</dt><dd>${unlocked?spec.trait:'解锁后揭示'}</dd><dt>关系</dt><dd>${parent?.name||'旅程起点'} → ${spec.name}${spec.next.length?' → '+spec.next.map(id=>byId[id].name).join(' / '):''}</dd></dl><p>${unlocked?spec.description:'解锁提示：'+(parent?parent.strategy:'开始生命之旅。')}</p>${spec.placeholder?'<small>当前使用程序生成的蠕虫占位模型。</small>':''}`;
  if(!unlocked)return;
  try{const object=await makeModel(spec.id);if(token!==request){disposeInstance(object);return;}model=object;scene.add(model);const front=spec.id==='fish'||spec.id==='slug'?-1:1;camera.position.set(spec.id==='flagellate'?2.7:4*front,spec.id==='flagellate'?1.3:2,spec.id==='flagellate'?3.2:5*front);controls.target.set(0,0,0);controls.update();$('preview-loading').hidden=true;}catch{$('preview-loading').textContent='模型暂时无法加载，请切换卡片重试。';}
 }
 function open(){
  init();const state=getState();$('atlas-count').textContent=state.unlocked.length+' / '+species.length;
  $('atlas-list').innerHTML=species.map((s,i)=>`<button class="atlas-item ${state.unlocked.includes(s.id)?'':'locked'}" data-index="${i}" style="--species-color:${s.color}"><span>${state.unlocked.includes(s.id)?s.icon:'◌'}</span><div><strong>${s.name}</strong><small>${state.unlocked.includes(s.id)?'已发现':'尚未发现'}</small></div></button>`).join('');
  $('atlas-list').querySelectorAll('button').forEach(b=>b.onclick=()=>select(+b.dataset.index));
  select(species.findIndex(s=>s.id===state.species));
 }
 $('atlas-prev').onclick=()=>select(index-1);$('atlas-next').onclick=()=>select(index+1);
 let touchStart=0;$('atlas-description').addEventListener('touchstart',e=>touchStart=e.touches[0].clientX,{passive:true});$('atlas-description').addEventListener('touchend',e=>{const d=e.changedTouches[0].clientX-touchStart;if(Math.abs(d)>50)select(index+(d<0?1:-1));},{passive:true});
 return {open,tick(time){if(!renderer||!$('atlas').open)return;const w=$('preview').clientWidth,h=$('preview').clientHeight;if(renderer.domElement.width!==Math.round(w*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}controls.update();animateModel(model,species[index].id,time);renderer.render(scene,camera);}};
}
